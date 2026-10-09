import os

import uuid

import sqlite3

from fastapi import FastAPI, HTTPException, Depends, status, Form

from fastapi.security import OAuth2PasswordBearer

from fastapi.middleware.cors import CORSMiddleware

from pydantic import BaseModel

from jose import JWTError, jwt

from datetime import datetime, timedelta

import subprocess

import json

import logging

from logging.handlers import RotatingFileHandler

import copy

import threading

import time

import pyodbc

import socket

import re

import ssl

import subprocess

import ldap3 

from ldap3 import Server, Connection, ALL, SUBTREE, BASE, Tls, RESTARTABLE # <-- Atualize esta linha

from pydantic import BaseModel

from fastapi.staticfiles import StaticFiles

from fastapi.responses import FileResponse, RedirectResponse



from contextlib import asynccontextmanager



SEARCH_LOG_DIR = os.path.join(

    os.path.dirname(

        os.path.abspath(__file__)

    ),

    "logs",

    "search"

)



SEARCH_LOG_FILE = os.path.join(

    SEARCH_LOG_DIR,

    "search_performance.log"

)



SEARCH_LOG_MAX_BYTES = 5 * 1024 * 1024

SEARCH_LOG_BACKUP_COUNT = 10



search_performance_logger = logging.getLogger(

    "kad.search.performance"

)



search_performance_logger.setLevel(

    logging.INFO

)



search_performance_logger.propagate = False



if not search_performance_logger.handlers:

    try:

        os.makedirs(

            SEARCH_LOG_DIR,

            exist_ok=True

        )



        search_log_handler = RotatingFileHandler(

            SEARCH_LOG_FILE,

            mode="a",

            maxBytes=SEARCH_LOG_MAX_BYTES,

            backupCount=SEARCH_LOG_BACKUP_COUNT,

            encoding="utf-8",

            delay=True

        )



        search_log_handler.setFormatter(

            logging.Formatter(

                "%(message)s"

            )

        )



        search_performance_logger.addHandler(

            search_log_handler

        )



    except Exception:

        pass







# ==========================================================

# CACHE CURTO DO MOTOR DE BUSCA

# ==========================================================



SEARCH_CACHE_TTL_SECONDS = 30

SEARCH_CACHE_MAX_ENTRIES = 100



search_cache = {}

search_cache_lock = threading.Lock()

search_cache_generation = 0



search_cache_metrics = {

    "hits": 0,

    "misses": 0,

    "expired": 0,

    "evictions": 0,

    "invalidations": 0

}





def build_search_cache_key(

    creds,

    search_term

):

    username = str(

        creds.get("username")

        or ""

    ).strip().lower()



    domain = str(

        creds.get("domain")

        or ""

    ).strip().lower()



    search_base = str(

        creds.get("search_base")

        or ""

    ).strip().lower()



    normalized_term = str(

        search_term

        or ""

    ).strip().casefold()



    return (

        username,

        domain,

        search_base,

        normalized_term

    )





def cleanup_search_cache_locked(

    now_monotonic

):

    expired_keys = [

        key

        for key, item in search_cache.items()

        if float(

            item.get(

                "expires_at",

                0

            )

        ) <= now_monotonic

    ]



    for key in expired_keys:

        search_cache.pop(

            key,

            None

        )



    if expired_keys:

        search_cache_metrics[

            "expired"

        ] += len(expired_keys)





def get_search_cache_generation():

    with search_cache_lock:

        return search_cache_generation





def get_search_cache(

    cache_key

):

    now_monotonic = time.monotonic()



    with search_cache_lock:

        cleanup_search_cache_locked(

            now_monotonic

        )



        item = search_cache.get(

            cache_key

        )



        if item is None:

            search_cache_metrics[

                "misses"

            ] += 1



            return None



        search_cache_metrics[

            "hits"

        ] += 1



        item["last_access"] = (

            now_monotonic

        )



        return copy.deepcopy(

            item["value"]

        )





def set_search_cache(

    cache_key,

    value,

    expected_generation

):

    now_monotonic = time.monotonic()



    with search_cache_lock:

        if expected_generation != search_cache_generation:

            return False



        cleanup_search_cache_locked(

            now_monotonic

        )



        if (

            cache_key not in search_cache

            and len(search_cache)

            >= SEARCH_CACHE_MAX_ENTRIES

        ):

            oldest_key = min(

                search_cache,

                key=lambda key: float(

                    search_cache[key].get(

                        "last_access",

                        0

                    )

                )

            )



            search_cache.pop(

                oldest_key,

                None

            )



            search_cache_metrics[

                "evictions"

            ] += 1



        search_cache[cache_key] = {

            "value": copy.deepcopy(

                value

            ),

            "created_at": (

                now_monotonic

            ),

            "last_access": (

                now_monotonic

            ),

            "expires_at": (

                now_monotonic

                + SEARCH_CACHE_TTL_SECONDS

            )

        }



        return True





def invalidate_search_cache():

    global search_cache_generation



    with search_cache_lock:

        search_cache_generation += 1

        removed = len(

            search_cache

        )



        search_cache.clear()



        search_cache_metrics[

            "invalidations"

        ] += 1



        return removed





def get_search_cache_status():

    now_monotonic = time.monotonic()



    with search_cache_lock:

        cleanup_search_cache_locked(

            now_monotonic

        )



        return {

            "enabled": True,

            "ttl_seconds": (

                SEARCH_CACHE_TTL_SECONDS

            ),

            "max_entries": (

                SEARCH_CACHE_MAX_ENTRIES

            ),

            "current_entries": len(

                search_cache

            ),

            "metrics": copy.deepcopy(

                search_cache_metrics

            )

        }





# ==========================================================

# MAPRIX (import isolado: se falhar, KAD e MoviMeX continuam no ar)

# ==========================================================

try:

    from maprix_api import maprix_app, iniciar_maprix, parar_maprix

    MAPRIX_DISPONIVEL = True

except Exception as erro_maprix:

    MAPRIX_DISPONIVEL = False

    print(f"[MAPRIX] Modulo desabilitado - falha no import: {erro_maprix}", flush=True)





MAPRIX_SCHEDULER_MODE = (

    os.environ.get(

        "MAPRIX_SCHEDULER_MODE",

        "embedded"

    )

    .strip()

    .lower()

)



MAPRIX_SCHEDULER_MODES = {

    "embedded",

    "external",

    "disabled"

}



if (

    MAPRIX_SCHEDULER_MODE

    not in MAPRIX_SCHEDULER_MODES

):

    print(

        "[MAPRIX] Modo de scheduler invalido: "

        f"{MAPRIX_SCHEDULER_MODE}. "

        "Usando embedded.",

        flush=True

    )



    MAPRIX_SCHEDULER_MODE = "embedded"





@asynccontextmanager

async def lifespan(app_: FastAPI):

    maprix_scheduler_iniciado = False



    if (

        MAPRIX_DISPONIVEL

        and MAPRIX_SCHEDULER_MODE

        == "embedded"

    ):

        try:

            iniciar_maprix()

            maprix_scheduler_iniciado = True



            print(

                "[MAPRIX] Scheduler executado "

                "no KADMobileService.",

                flush=True

            )



        except Exception as e:

            print(

                "[MAPRIX] Falha ao iniciar "

                f"o scheduler: {e}",

                flush=True

            )



    elif (

        MAPRIX_DISPONIVEL

        and MAPRIX_SCHEDULER_MODE

        == "external"

    ):

        print(

            "[MAPRIX] Scheduler externo configurado. "

            "API carregada sem iniciar coleta local.",

            flush=True

        )



    elif (

        MAPRIX_SCHEDULER_MODE

        == "disabled"

    ):

        print(

            "[MAPRIX] Scheduler desabilitado.",

            flush=True

        )



    yield



    if maprix_scheduler_iniciado:

        try:

            parar_maprix()



        except Exception as e:

            print(

                "[MAPRIX] Falha ao parar "

                f"o scheduler: {e}",

                flush=True

            )





app = FastAPI(title="KAD Mobile API - Módulo Avançado AD com Auditoria", lifespan=lifespan)



app.add_middleware(

    CORSMiddleware,

    allow_origins=["*"],

    allow_credentials=True,

    allow_methods=["*"],

    allow_headers=["*"],

)



# --- CONFIGURAÇÃO DO AUDIT LOGGER (SQLITE) ---

class AuditLogger:

    DB_FILE = "KAD_Audit.db"



    @staticmethod

    def _init_db():

        """Cria o banco de dados e a tabela caso não existam"""

        conn = sqlite3.connect(AuditLogger.DB_FILE)

        c = conn.cursor()

        c.execute('''CREATE TABLE IF NOT EXISTS audit_logs

                     (id INTEGER PRIMARY KEY AUTOINCREMENT,

                      data_hora TEXT,

                      operador TEXT,

                      acao TEXT,

                      alvo TEXT,

                      status TEXT)''')

        conn.commit()

        conn.close()



    @staticmethod

    def log(operador: str, acao: str, alvo: str, status: str):

        try:

            AuditLogger._init_db()

            conn = sqlite3.connect(AuditLogger.DB_FILE)

            c = conn.cursor()

            timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

            

            c.execute("INSERT INTO audit_logs (data_hora, operador, acao, alvo, status) VALUES (?, ?, ?, ?, ?)",

                      (timestamp, operador, acao, alvo, status))

            

            conn.commit()

            conn.close()

        except Exception as e:

            print(f"Erro ao gravar log de auditoria no DB: {e}")



# --- CONFIGURAÇÕES DE SEGURANÇA ---

SECRET_KEY = os.environ["KAD_SECRET_KEY"]

ALGORITHM = "HS256"

ACCESS_TOKEN_EXPIRE_MINUTES = 120 



oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")



# --- MODELOS DE DADOS ---

class PasswordReset(BaseModel):

    new_password: str

    force_change: bool = True

    unlock_account: bool = False



class ProfileEdit(BaseModel):

    title: str = ""

    department: str = ""

    telephone: str = ""

    description: str | None = None

    manager_dn: str | None = None



class MoveObject(BaseModel):

    new_ou: str



class BulkAction(BaseModel):

    usernames: list[str]



class Token(BaseModel):

    access_token: str

    token_type: str



class NotifyPayload(BaseModel):

    message: str



class ForceChangeUpdate(BaseModel):

    force: bool



# --- JWT & AUTENTICAÇÃO DINÂMICA ---

def create_access_token(data: dict):

    to_encode = data.copy()

    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode.update({"exp": expire})

    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)



def get_current_credentials(token: str = Depends(oauth2_scheme)):

    credentials_exception = HTTPException(

        status_code=status.HTTP_401_UNAUTHORIZED,

        detail="Sessão expirada ou inválida",

        headers={"WWW-Authenticate": "Bearer"},

    )

    try:

        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])

        username: str = payload.get("sub")

        password: str = payload.get("pwd")

        server: str = payload.get("srv")

        domain: str = payload.get("dom")

        

        if not username or not password or not server or not domain:

            raise credentials_exception

            

        # O PULO DO GATO: Calcula a base de pesquisa dinamicamente baseado no domínio fornecido

        search_base = ",".join([f"DC={p}" for p in domain.split('.')])

        

        return {

            "username": username, 

            "password": password, 

            "server": server, 

            "domain": domain,

            "search_base": search_base

        }

    except JWTError:

        raise credentials_exception



def get_ldap_connection(creds: dict):

    domain = creds['domain']

    server_ip = creds['server']

    

    # --- MOTOR DE AUTO-DISCOVERY DO ACTIVE DIRECTORY ---

    if not server_ip or server_ip.upper() == 'AUTO':

        try:

            server_ip = socket.gethostbyname(domain)

        except socket.gaierror:

            raise HTTPException(status_code=400, detail=f"Falha de DNS: Não foi possível localizar um servidor para {domain}")

    # ----------------------------------------------------

    

    full_username = f"{creds['username']}@{domain}"

    

    try:

        # Tentativa 1: Conexão Segura LDAPS (Porta 636)

        tls_conf = Tls(validate=ssl.CERT_NONE, version=ssl.PROTOCOL_TLSv1_2)

        server = Server(server_ip, port=636, use_ssl=True, get_info=ALL, tls=tls_conf)

        conn = Connection(server, user=full_username, password=creds['password'], authentication='SIMPLE', auto_bind=True, client_strategy=RESTARTABLE, receive_timeout=15)

        return conn

    except Exception as e_ssl:

        try:

            # Tentativa 2: Rota de Fuga LDAP Padrão (Porta 389)

            server = Server(server_ip, port=389, get_info=ALL)

            conn = Connection(server, user=full_username, password=creds['password'], authentication='SIMPLE', auto_bind=True, client_strategy=RESTARTABLE, receive_timeout=15)

            return conn

        except Exception as e_plain:

            raise HTTPException(status_code=401, detail=f"Erro de autenticação no Servidor {server_ip}: {str(e_plain)}")



# --- MOTOR DE POWERSHELL DINÂMICO ---

def run_powershell(command: str, creds: dict, return_json: bool = True):

    # Gera o NetBIOS dinâmico para o WinRM (Ex: kinrossgold.com -> kinrossgold)

    domain_netbios = creds['domain'].split('.')[0]

    

    auth_prefix = (

        f"$secpasswd = ConvertTo-SecureString '{creds['password']}' -AsPlainText -Force; "

        f"$mycreds = New-Object System.Management.Automation.PSCredential ('{domain_netbios}\\{creds['username']}', $secpasswd); "

    )

    

    suffix = " | ConvertTo-Json -Compress -Depth 5" if return_json else ""

    full_command = f"{auth_prefix} {command} {suffix}"

    

    ps_exec = r"C:\Windows\sysnative\WindowsPowerShell\v1.0\powershell.exe"

    if not os.path.exists(ps_exec):

        ps_exec = "powershell.exe"

        

    try:

        result = subprocess.run(

            [ps_exec, "-ExecutionPolicy", "Bypass", "-NoProfile", "-Command", full_command],

            capture_output=True, text=True, encoding='cp850', errors='replace',

            timeout=35

        )

        

        if result.returncode != 0:

            erro_real = result.stderr.strip() if result.stderr else result.stdout.strip()

            if "PSRemotingTransportException" in erro_real or "WinRMOperationTimeout" in erro_real or "Falha ao conectar" in erro_real:

                raise HTTPException(status_code=400, detail="A máquina alvo está offline, fora da rede ou com o Firewall bloqueando o WinRM.")

            raise HTTPException(status_code=400, detail=f"Erro no WinRM: {erro_real}")

            

        stdout_str = result.stdout.strip()

        if not return_json or not stdout_str:

            return {"status": "success", "message": stdout_str or "Executado com sucesso."}

            

        try:

            return json.loads(stdout_str)

        except json.JSONDecodeError:

            return stdout_str 

            

    except subprocess.TimeoutExpired:

        raise HTTPException(status_code=400, detail="Tempo limite excedido. O alvo não respondeu.")

    except subprocess.CalledProcessError as e:

        raise HTTPException(status_code=400, detail=f"Falha de execução do Processo: {str(e)}")



@app.post("/computers/{hostname}/enable-winrm")

async def enable_winrm_via_dcom(hostname: str, creds: dict = Depends(get_current_credentials)):

    # 1. Limpa o "$" e força o FQDN para o DNS achar a máquina sem dar erro de RPC

    network_target = hostname.rstrip('$').lower()

    if "." not in network_target:

        network_target = f"{network_target}.{creds['domain']}"

        

    # 2. O EXATO CÓDIGO QUE VOCÊ TESTOU (Com injeção de Credenciais)

    script_block = (

        "$ErrorActionPreference = 'Stop'; "

        "$opcao = New-CimSessionOption -Protocol Dcom; "

        f"$sessao = New-CimSession -ComputerName '{network_target}' -SessionOption $opcao -Credential $mycreds; "

        "$res = Invoke-CimMethod -CimSession $sessao -ClassName Win32_Process -MethodName Create -Arguments @{CommandLine = 'powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -Command Enable-PSRemoting -Force'}; "

        "Remove-CimSession -CimSession $sessao; "

        "if ($res.ReturnValue -ne 0) { throw 'Código de erro no processo WMI: ' + $res.ReturnValue } else { Write-Output 'SUCESSO' }"

    )

    

    try:

        # Monta a credencial do analista de forma segura

        domain_netbios = creds['domain'].split('.')[0]

        auth_prefix = (

            f"$secpasswd = ConvertTo-SecureString '{creds['password']}' -AsPlainText -Force; "

            f"$mycreds = New-Object System.Management.Automation.PSCredential ('{domain_netbios}\\{creds['username']}', $secpasswd); "

        )

        

        full_command = f"{auth_prefix} {script_block}"

        

        # Executa no PowerShell do servidor com 30 segundos de tolerância

        result = subprocess.run(

            ["powershell", "-ExecutionPolicy", "Bypass", "-NoProfile", "-Command", full_command], 

            capture_output=True, text=True, encoding='cp850', errors='replace', timeout=30

        )

        

        # Se o PowerShell cuspir algum erro vermelho

        if result.returncode != 0:

            erro = result.stderr.strip() if result.stderr else result.stdout.strip()

            raise HTTPException(status_code=400, detail=f"Falha de RPC/DCOM: {erro}")

            

        AuditLogger.log(creds["username"], "ForcarWinRM_DCOM", network_target, "SUCESSO")

        return {"status": "success", "message": f"WinRM ativado via DCOM na máquina {network_target}!"}

        

    except subprocess.TimeoutExpired:

        raise HTTPException(status_code=408, detail="Timeout: O firewall ignorou o pacote DCOM (Drop) sem responder.")

    except HTTPException:

        raise

    except Exception as e:

        raise HTTPException(status_code=500, detail=f"Erro interno no motor Python: {str(e)}")



# --- ENDPOINTS BÁSICOS E BUSCA ---



@app.post("/token", response_model=Token)

async def login_for_access_token(

    username: str = Form(...), 

    password: str = Form(...),

    server: str = Form("AUTO"), # <--- Mudamos o padrão para AUTO-DISCOVERY

    domain: str = Form("kinrossgold.com")

):

    creds = {"username": username, "password": password, "server": server, "domain": domain}

    conn = get_ldap_connection(creds)

    conn.unbind()

    

    access_token = create_access_token(data={

        "sub": username, 

        "pwd": password, 

        "srv": server, 

        "dom": domain

    })

    return {"access_token": access_token, "token_type": "bearer"}



@app.get("/users/{search_term}")

def get_user(search_term: str, creds: dict = Depends(get_current_credentials)):

    

    extra_samaccounts = []

    termo_limpo = search_term.strip()



    busca_inicio_total = time.perf_counter()

    busca_tempo_xupervisor_ms = 0.0

    busca_tempo_vetorh_ms = 0.0

    busca_tempo_ldap_conexao_ms = 0.0

    busca_tempo_ldap_pesquisa_ms = 0.0

    busca_tempo_formatacao_ms = 0.0

    busca_origem_auxiliar = "none"



    busca_cache_generation = get_search_cache_generation()



    busca_cache_key = build_search_cache_key(

        creds,

        termo_limpo

    )



    busca_cache_resultado = get_search_cache(

        busca_cache_key

    )



    if busca_cache_resultado is not None:

        busca_tempo_total_ms = round(

            (

                time.perf_counter()

                - busca_inicio_total

            )

            * 1000,

            2

        )



        busca_log = {

            "timestamp": datetime.now().isoformat(

                timespec="seconds"

            ),

            "term_type": "cache",

            "term_length": len(

                termo_limpo

            ),

            "auxiliary_source": "cache",

            "ldap_mode": "cache",

            "result_count": len(

                busca_cache_resultado.get(

                    "data",

                    []

                )

            ),

            "cache_hit": True,

            "xupervisor_ms": 0.0,

            "vetorh_ms": 0.0,

            "ldap_connect_ms": 0.0,

            "ldap_search_ms": 0.0,

            "formatting_ms": 0.0,

            "total_ms": busca_tempo_total_ms

        }



        try:

            search_performance_logger.info(

                json.dumps(

                    busca_log,

                    ensure_ascii=False,

                    separators=(",", ":")

                )

            )

        except Exception:

            pass



        print(

            "[SEARCH PERFORMANCE] "

            + json.dumps(

                busca_log,

                ensure_ascii=False,

                separators=(",", ":")

            ),

            flush=True

        )



        return busca_cache_resultado



    # =================================================================

    # 1. TRADUTOR INTELIGENTE: BUSCA REVERSA POR IP (DNS REVERSE LOOKUP)

    # =================================================================

    if re.match(r"^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$", termo_limpo):

        try:

            # Tenta descobrir o nome da máquina na rede a partir do IP

            hostname_completo = socket.gethostbyaddr(termo_limpo)[0]

            

            # Extrai apenas o nome curto (Ex: PTU-DT-47774.kinrossgold.com -> PTU-DT-47774)

            nome_curto = hostname_completo.split('.')[0]

            

            # Adiciona o $ no final, pois contas de computador no AD sempre terminam com $

            extra_samaccounts.append(f"{nome_curto}$")

        except Exception:

            # Se o IP não existir no DNS ou a máquina estiver offline, lança erro amigável

            raise HTTPException(status_code=404, detail=f"IP {termo_limpo} não responde a buscas de DNS reverso.")

            

    # =================================================================

    # 2. TRADUTOR INTELIGENTE: MATRÍCULA / IGA DIGID PARA O VETORH

    # =================================================================

    else:

        serial_encontrado_xupervisor = False



        formato_mac_xupervisor = bool(

            re.fullmatch(

                r'(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}',

                termo_limpo

            )

        )



        mac_term_xupervisor = (

            termo_limpo.upper().replace('-', ':')

            if formato_mac_xupervisor

            else None

        )



        xupervisor_database = os.path.join(

            os.path.dirname(

                os.path.abspath(__file__)

            ),

            "database",

            "xupervisor_inventory.db"

        )



        if os.path.isfile(xupervisor_database):

            xupervisor_connection = None

            busca_inicio_xupervisor = time.perf_counter()



            try:

                xupervisor_uri = (

                    "file:"

                    + xupervisor_database.replace(

                        "\\",

                        "/"

                    )

                    + "?mode=ro"

                )



                xupervisor_connection = sqlite3.connect(

                    xupervisor_uri,

                    uri=True,

                    timeout=1

                )



                if formato_mac_xupervisor:

                    xupervisor_rows = (

                        xupervisor_connection

                        .execute(

                            """

                            SELECT

                                hostname

                            FROM inventory_current

                            WHERE

                                mac_addresses = ?

                                OR mac_addresses LIKE ?

                                OR mac_addresses LIKE ?

                                OR mac_addresses LIKE ?

                            LIMIT 20

                            """,

                            (

                                mac_term_xupervisor,

                                mac_term_xupervisor + ";%",

                                "%;" + mac_term_xupervisor,

                                "%;" + mac_term_xupervisor + ";%"

                            )

                        )

                        .fetchall()

                    )

                else:

                    xupervisor_rows = (

                        xupervisor_connection

                        .execute(

                            """

                            SELECT

                                hostname

                            FROM inventory_current

                            WHERE serial_number = ?

                                COLLATE NOCASE

                            LIMIT 20

                            """,

                            (

                                termo_limpo,

                            )

                        )

                        .fetchall()

                    )



                for xupervisor_row in xupervisor_rows:

                    hostname_value = xupervisor_row[0]



                    if not hostname_value:

                        continue



                    hostname_xupervisor = (

                        str(hostname_value)

                        .strip()

                        .split(".")[0]

                        .rstrip("$")

                        .upper()

                    )



                    sam_xupervisor = (

                        hostname_xupervisor + "$"

                    )



                    if (

                        sam_xupervisor

                        not in extra_samaccounts

                    ):

                        extra_samaccounts.append(

                            sam_xupervisor

                        )



                serial_encontrado_xupervisor = bool(

                    xupervisor_rows

                )



            except sqlite3.Error:

                serial_encontrado_xupervisor = False



            finally:

                if xupervisor_connection is not None:

                    xupervisor_connection.close()



                busca_tempo_xupervisor_ms = round(

                    (

                        time.perf_counter()

                        - busca_inicio_xupervisor

                    )

                    * 1000,

                    2

                )



        if serial_encontrado_xupervisor:

            busca_origem_auxiliar = "xupervisor"



        formato_matricula = termo_limpo.isdigit()

        formato_iga_digid = bool(

            re.fullmatch(

                r"[A-Za-z][0-9]+",

                termo_limpo

            )

        )



        if (

            not serial_encontrado_xupervisor

            and (

                formato_matricula

                or formato_iga_digid

            )

        ):

            conn_db = None

            cursor_db = None



            busca_inicio_vetorh = time.perf_counter()



            try:

                conn_db = get_db_connection()



                if conn_db is not None:

                    conn_db.timeout = 3

                    cursor_db = conn_db.cursor()



                    if formato_matricula:

                        cursor_db.execute(

                            """

                            SELECT

                                usu_networkid

                            FROM vetorh.r034cpl

                            WHERE

                                usu_igadigid = ?

                                OR numcad = ?

                            """,

                            (

                                termo_limpo,

                                int(termo_limpo)

                            )

                        )

                    else:

                        cursor_db.execute(

                            """

                            SELECT

                                usu_networkid

                            FROM vetorh.r034cpl

                            WHERE

                                usu_igadigid = ?

                            """,

                            (

                                termo_limpo,

                            )

                        )



                    for vetorh_row in cursor_db.fetchmany(20):

                        if not vetorh_row[0]:

                            continue



                        sam_vetorh = str(

                            vetorh_row[0]

                        ).strip()



                        if (

                            sam_vetorh

                            not in extra_samaccounts

                        ):

                            extra_samaccounts.append(

                                sam_vetorh

                            )



            except Exception:

                pass



            finally:

                if cursor_db is not None:

                    try:

                        cursor_db.close()

                    except Exception:

                        pass



                if conn_db is not None:

                    try:

                        conn_db.close()

                    except Exception:

                        pass



                busca_tempo_vetorh_ms = round(

                    (

                        time.perf_counter()

                        - busca_inicio_vetorh

                    )

                    * 1000,

                    2

                )



            if extra_samaccounts:

                busca_origem_auxiliar = "vetorh"



    busca_inicio_ldap_conexao = time.perf_counter()

    conn = get_ldap_connection(creds)

    busca_tempo_ldap_conexao_ms = round(

        (

            time.perf_counter()

            - busca_inicio_ldap_conexao

        )

        * 1000,

        2

    )

    try:

        termo_ldap = (

            ldap3.utils.conv.escape_filter_chars(

                termo_limpo

            )

        )



        atributos_descoberta = [

            'sAMAccountName',

            'distinguishedName',

            'objectClass'

        ]



        atributos_detalhes = [

            'sAMAccountName',

            'displayName',

            'mail',

            'employeeID',

            'pager',

            'userAccountControl',

            'lockoutTime',

            'objectClass',

            'description',

            'operatingSystem',

            'title',

            'department',

            'telephoneNumber',

            'company',

            'physicalDeliveryOfficeName',

            'distinguishedName',

            'memberOf',

            'member',

            'dNSHostName',

            'managedBy',

            'manager',

            'lastLogonTimestamp',

            'whenCreated',

            'whenChanged',

            'uSNCreated',

            'uSNChanged',

            'directReports',

            'groupType',

            'ESIJDESSOJdeUserName',

            'pwdLastSet'

        ]



        contas_exatas = []



        for valor in (

            termo_limpo,

            termo_limpo.rstrip("$") + "$"

        ):

            if valor not in contas_exatas:

                contas_exatas.append(valor)



        for sam in extra_samaccounts:

            sam_texto = str(sam).strip()



            if (

                sam_texto

                and sam_texto not in contas_exatas

            ):

                contas_exatas.append(

                    sam_texto

                )



        filtros_contas_exatas = ""



        for conta in contas_exatas:

            conta_ldap = (

                ldap3.utils.conv.escape_filter_chars(

                    conta

                )

            )



            filtros_contas_exatas += (

                f"(sAMAccountName={conta_ldap})"

            )



        filtro_exato = (

            "(|"

            + filtros_contas_exatas

            + f"(displayName={termo_ldap})"

            + f"(mail={termo_ldap})"

            + f"(employeeID={termo_ldap})"

            + f"(pager={termo_ldap})"

            + f"(cn={termo_ldap})"

            + f"(dNSHostName={termo_ldap})"

            + ")"

        )



        modo_busca_ldap = "exact"



        busca_inicio_ldap = time.perf_counter()



        conn.search(

            creds['search_base'],

            filtro_exato,

            search_scope=SUBTREE,

            attributes=atributos_descoberta,

            size_limit=20,

            time_limit=5

        )



        busca_tempo_ldap_pesquisa_ms += round(

            (

                time.perf_counter()

                - busca_inicio_ldap

            )

            * 1000,

            2

        )



        if not conn.entries:

            modo_busca_ldap = "prefix"



            filtro_prefixo = (

                "(|"

                f"(sAMAccountName={termo_ldap}*)"

                f"(displayName={termo_ldap}*)"

                f"(mail={termo_ldap}*)"

                f"(employeeID={termo_ldap}*)"

                f"(pager={termo_ldap}*)"

                f"(cn={termo_ldap}*)"

                f"(dNSHostName={termo_ldap}*)"

            )



            for sam in extra_samaccounts:

                sam_ldap = (

                    ldap3.utils.conv.escape_filter_chars(

                        str(sam)

                    )

                )



                filtro_prefixo += (

                    f"(sAMAccountName={sam_ldap})"

                )



            filtro_prefixo += ")"



            busca_inicio_ldap = time.perf_counter()



            conn.search(

                creds['search_base'],

                filtro_prefixo,

                search_scope=SUBTREE,

                attributes=atributos_descoberta,

                size_limit=20,

                time_limit=5

            )



            busca_tempo_ldap_pesquisa_ms += round(

                (

                    time.perf_counter()

                    - busca_inicio_ldap

                )

                * 1000,

                2

            )



        if not conn.entries:

            modo_busca_ldap = "contains"



            filtro_contem = (

                "(|"

                f"(sAMAccountName=*{termo_ldap}*)"

                f"(displayName=*{termo_ldap}*)"

                f"(mail=*{termo_ldap}*)"

                f"(employeeID=*{termo_ldap}*)"

                f"(pager=*{termo_ldap}*)"

                f"(cn=*{termo_ldap}*)"

                f"(dNSHostName=*{termo_ldap}*)"

            )



            for sam in extra_samaccounts:

                sam_ldap = (

                    ldap3.utils.conv.escape_filter_chars(

                        str(sam)

                    )

                )



                filtro_contem += (

                    f"(sAMAccountName={sam_ldap})"

                )



            filtro_contem += ")"



            busca_inicio_ldap = time.perf_counter()



            conn.search(

                creds['search_base'],

                filtro_contem,

                search_scope=SUBTREE,

                attributes=atributos_descoberta,

                size_limit=20,

                time_limit=8

            )



            busca_tempo_ldap_pesquisa_ms += round(

                (

                    time.perf_counter()

                    - busca_inicio_ldap

                )

                * 1000,

                2

            )



        if not conn.entries:

            raise HTTPException(

                status_code=404,

                detail="Objeto nao encontrado."

            )



        entradas_descobertas = list(

            conn.entries

        )



        contas_detalhes = []



        for entrada_descoberta in entradas_descobertas:

            if (

                'sAMAccountName'

                not in entrada_descoberta

            ):

                continue



            if not entrada_descoberta.sAMAccountName:

                continue



            conta_detalhe = str(

                entrada_descoberta

                .sAMAccountName

                .value

            ).strip()



            if (

                conta_detalhe

                and conta_detalhe

                not in contas_detalhes

            ):

                contas_detalhes.append(

                    conta_detalhe

                )



        if not contas_detalhes:

            raise HTTPException(

                status_code=404,

                detail="Objetos localizados sem identificador AD."

            )



        filtro_detalhes = "(|"



        for conta_detalhe in contas_detalhes:

            conta_detalhe_ldap = (

                ldap3.utils.conv.escape_filter_chars(

                    conta_detalhe

                )

            )



            filtro_detalhes += (

                f"(sAMAccountName={conta_detalhe_ldap})"

            )



        filtro_detalhes += ")"



        busca_inicio_ldap = time.perf_counter()



        conn.search(

            creds['search_base'],

            filtro_detalhes,

            search_scope=SUBTREE,

            attributes=atributos_detalhes,

            size_limit=20,

            time_limit=5

        )



        busca_tempo_ldap_pesquisa_ms += round(

            (

                time.perf_counter()

                - busca_inicio_ldap

            )

            * 1000,

            2

        )



        if not conn.entries:

            raise HTTPException(

                status_code=404,

                detail="Detalhes dos objetos nao encontrados."

            )



        busca_inicio_formatacao = time.perf_counter()



        results = []

        for entry in conn.entries:

            obj_classes = [c.lower() for c in entry.objectClass.values] if entry.objectClass else []

            if "computer" in obj_classes:

                obj_type = "Computer"

            elif "group" in obj_classes:

                obj_type = "Group"

            else:

                obj_type = "User"

            

            uac = entry.userAccountControl.value if entry.userAccountControl else 0

            is_enabled = not bool(uac & 2) 

            is_locked = bool(entry.lockoutTime and hasattr(entry.lockoutTime.value, 'year') and entry.lockoutTime.value.year > 1601)

            

            matricula = entry.pager.value if 'pager' in entry and entry.pager else (entry.employeeID.value if 'employeeID' in entry and entry.employeeID else None)



            grupos = [str(g).split(',')[0].replace('CN=', '') for g in entry.memberOf.values] if 'memberOf' in entry and entry.memberOf else []

            membros = [str(m).split(',')[0].replace('CN=', '') for m in entry.member.values] if 'member' in entry and entry.member else []

            

            mgr = ""

            if 'manager' in entry and entry.manager:

                mgr = str(entry.manager.value)

            elif 'managedBy' in entry and entry.managedBy:

                mgr = str(entry.managedBy.value)

                

            manager_clean = mgr.split(',')[0].replace('CN=', '') if mgr else "N/A"

            

            last_logon = "Nunca"

            if 'lastLogonTimestamp' in entry and entry.lastLogonTimestamp.value:

                try: last_logon = entry.lastLogonTimestamp.value.strftime('%d/%m/%Y %H:%M:%S')

                except: last_logon = str(entry.lastLogonTimestamp.value)

                

            created = entry.whenCreated.value.strftime('%d/%m/%Y %H:%M:%S') if 'whenCreated' in entry and entry.whenCreated else "N/A"

            modified = entry.whenChanged.value.strftime('%d/%m/%Y %H:%M:%S') if 'whenChanged' in entry and entry.whenChanged else "N/A"

            

            direct_reps = [str(dr).split(',')[0].replace('CN=', '') for dr in entry.directReports.values] if 'directReports' in entry and entry.directReports.values else []

            

            dns_name = str(entry.dNSHostName.value) if 'dNSHostName' in entry and entry.dNSHostName.value else None

            ipv4 = "N/A"

            if obj_type == "Computer" and dns_name:

                try: ipv4 = socket.gethostbyname(dns_name)

                except: ipv4 = "Offline"

                

            group_cat, group_scope = "N/A", "N/A"

            if 'groupType' in entry and entry.groupType.value:

                gt = int(entry.groupType.value)

                group_cat = "Security" if (gt & 2147483648) else "Distribution"

                group_scope = "Global" if (gt & 2) else ("Domain Local" if (gt & 4) else "Universal")



            # --- NOVO: Extração inteligente da Data da Senha com Correção de Fuso (UTC-3) ---

            pwd_val = entry.pwdLastSet.value if 'pwdLastSet' in entry and entry.pwdLastSet else None

            pwd_date_str = "Desconhecido"

            pwd_int_flag = -1

            

            if pwd_val:

                if str(pwd_val) == '0' or '1601' in str(pwd_val):

                    pwd_date_str = "Troca Pendente no Logon"

                    pwd_int_flag = 0

                else:

                    try:

                        from datetime import timedelta

                        # Remove a zona de tempo original (UTC) e subtrai 3 horas para o Brasil

                        pwd_local = pwd_val.replace(tzinfo=None) - timedelta(hours=3)

                        pwd_date_str = pwd_local.strftime('%d/%m/%Y %H:%M:%S')

                    except Exception:

                        pwd_date_str = str(pwd_val)



            results.append({

                "SamAccountName": entry.sAMAccountName.value if 'sAMAccountName' in entry and entry.sAMAccountName else "N/A",

                "DisplayName": entry.displayName.value if 'displayName' in entry and entry.displayName else (entry.sAMAccountName.value if 'sAMAccountName' in entry else "N/A"),

                "EmailAddress": entry.mail.value if 'mail' in entry and entry.mail else None,

                "EmployeeID": matricula,

                "Title": entry.title.value if 'title' in entry and entry.title else "N/A",

                "Department": entry.department.value if 'department' in entry and entry.department else "N/A",

                "TelephoneNumber": entry.telephoneNumber.value if 'telephoneNumber' in entry and entry.telephoneNumber else "N/A",

                "Company": entry.company.value if 'company' in entry and entry.company else "N/A",

                "Office": entry.physicalDeliveryOfficeName.value if 'physicalDeliveryOfficeName' in entry and entry.physicalDeliveryOfficeName else "N/A",

                "Description": entry.description.value if 'description' in entry and entry.description else "N/A",

                "OS": entry.operatingSystem.value if 'operatingSystem' in entry and entry.operatingSystem else "N/A",

                "DN": entry.distinguishedName.value if 'distinguishedName' in entry else "N/A",

                "Enabled": is_enabled,

                "LockedOut": is_locked,

                "pwdLastSet": pwd_int_flag,            # <- Para a lógica do Switch

                "PwdLastSetDate": pwd_date_str,        # <- Para o visor de texto

                "UserAccountControl": uac,

                "Type": obj_type,

                "MemberOf": sorted(grupos),

                "Members": sorted(membros),

                "Manager": manager_clean,

                "ManagerDN": mgr or None,

                "LastLogon": last_logon,

                "Created": created,

                "Modified": modified,

                "USNCreated": str(entry.uSNCreated.value) if 'uSNCreated' in entry and entry.uSNCreated else "N/A",

                "USNChanged": str(entry.uSNChanged.value) if 'uSNChanged' in entry and entry.uSNChanged else "N/A",

                "DirectReports": sorted(direct_reps),

                "DNS": dns_name or "N/A",

                "IPv4": ipv4,

                "GroupCategory": group_cat,

                "GroupScope": group_scope,

                "PasswordNeverExpires": bool(uac & 65536) if uac else False,

                "ObjectClass": entry.objectClass.values[-1] if 'objectClass' in entry and entry.objectClass.values else obj_type,

                "ESIJ_User": str(entry.ESIJDESSOJdeUserName.value) if 'ESIJDESSOJdeUserName' in entry and entry.ESIJDESSOJdeUserName else "N/A"

            })



        busca_tempo_formatacao_ms = round(

            (

                time.perf_counter()

                - busca_inicio_formatacao

            )

            * 1000,

            2

        )



        busca_tempo_total_ms = round(

            (

                time.perf_counter()

                - busca_inicio_total

            )

            * 1000,

            2

        )



        busca_tipo_termo = "text"



        if re.fullmatch(

            r"\d{1,3}(\.\d{1,3}){3}",

            termo_limpo

        ):

            busca_tipo_termo = "ip"

        elif re.fullmatch(

            r"(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}",

            termo_limpo

        ):

            busca_tipo_termo = "mac"

        elif termo_limpo.isdigit():

            busca_tipo_termo = "numeric"

        elif re.fullmatch(

            r"[A-Za-z][0-9]+",

            termo_limpo

        ):

            busca_tipo_termo = "alphanumeric_id"

        elif extra_samaccounts:

            busca_tipo_termo = "translated"



        busca_log = {

            "timestamp": datetime.now().isoformat(

                timespec="seconds"

            ),

            "term_type": busca_tipo_termo,

            "term_length": len(termo_limpo),

            "auxiliary_source": busca_origem_auxiliar,

            "ldap_mode": modo_busca_ldap,

            "result_count": len(results),

            "cache_hit": False,

            "xupervisor_ms": busca_tempo_xupervisor_ms,

            "vetorh_ms": busca_tempo_vetorh_ms,

            "ldap_connect_ms": busca_tempo_ldap_conexao_ms,

            "ldap_search_ms": round(

                busca_tempo_ldap_pesquisa_ms,

                2

            ),

            "formatting_ms": busca_tempo_formatacao_ms,

            "total_ms": busca_tempo_total_ms

        }



        try:

            search_performance_logger.info(

                json.dumps(

                    busca_log,

                    ensure_ascii=False,

                    separators=(",", ":")

                )

            )



        except Exception:

            pass



        print(

            "[SEARCH PERFORMANCE] "

            + json.dumps(

                busca_log,

                ensure_ascii=False,

                separators=(",", ":")

            ),

            flush=True

        )



        busca_resposta = {

            "data": results

        }



        set_search_cache(

            busca_cache_key,

            busca_resposta,

            busca_cache_generation

        )



        return busca_resposta

    finally:

        conn.unbind()



# --- AÇÕES DE CONTA E EDIÇÃO DE PERFIL ---



@app.get("/users/{username}/managed-computers")

def get_managed_computers(

    username: str,

    creds: dict = Depends(get_current_credentials)

):

    conn = get_ldap_connection(creds)



    try:

        username_clean = username.strip()

        username_filter = ldap3.utils.conv.escape_filter_chars(

            username_clean

        )



        conn.search(

            creds['search_base'],

            (

                "(&(objectClass=user)"

                "(!(objectClass=computer))"

                f"(sAMAccountName={username_filter}))"

            ),

            search_scope=SUBTREE,

            attributes=[

                'distinguishedName',

                'displayName',

                'sAMAccountName'

            ]

        )



        if not conn.entries:

            raise HTTPException(

                status_code=404,

                detail="Usuario nao encontrado no Active Directory."

            )



        user_entry = conn.entries[0]

        user_dn = user_entry.entry_dn

        managed_by_filter = ldap3.utils.conv.escape_filter_chars(

            user_dn

        )



        conn.search(

            creds['search_base'],

            (

                "(&(objectClass=computer)"

                f"(managedBy={managed_by_filter}))"

            ),

            search_scope=SUBTREE,

            attributes=[

                'sAMAccountName',

                'displayName',

                'dNSHostName',

                'operatingSystem',

                'description',

                'userAccountControl',

                'distinguishedName',

                'whenChanged'

            ]

        )



        computadores = []



        for entry in conn.entries:

            sam_account = (

                str(entry.sAMAccountName.value)

                if (

                    'sAMAccountName' in entry

                    and entry.sAMAccountName.value

                )

                else ""

            )



            display_name = (

                str(entry.displayName.value)

                if (

                    'displayName' in entry

                    and entry.displayName.value

                )

                else sam_account.rstrip('$')

            )



            dns_name = (

                str(entry.dNSHostName.value)

                if (

                    'dNSHostName' in entry

                    and entry.dNSHostName.value

                )

                else None

            )



            operating_system = (

                str(entry.operatingSystem.value)

                if (

                    'operatingSystem' in entry

                    and entry.operatingSystem.value

                )

                else "N/A"

            )



            description = (

                str(entry.description.value)

                if (

                    'description' in entry

                    and entry.description.value

                )

                else "N/A"

            )



            uac = (

                int(entry.userAccountControl.value)

                if (

                    'userAccountControl' in entry

                    and entry.userAccountControl.value is not None

                )

                else 0

            )



            modified = "N/A"



            if (

                'whenChanged' in entry

                and entry.whenChanged.value

            ):

                try:

                    modified = entry.whenChanged.value.strftime(

                        '%d/%m/%Y %H:%M:%S'

                    )

                except Exception:

                    modified = str(entry.whenChanged.value)



            ipv4 = "N/A"



            if dns_name:

                try:

                    ipv4 = socket.gethostbyname(dns_name)

                except Exception:

                    ipv4 = "Offline ou sem DNS"



            computadores.append({

                "SamAccountName": sam_account,

                "DisplayName": display_name,

                "DNS": dns_name or "N/A",

                "IPv4": ipv4,

                "OS": operating_system,

                "Description": description,

                "Enabled": not bool(uac & 2),

                "DN": entry.entry_dn,

                "Modified": modified

            })



        computadores.sort(

            key=lambda item: (

                item.get("DisplayName") or ""

            ).lower()

        )



        AuditLogger.log(

            creds["username"],

            "ConsultarComputadoresGerenciados",

            username_clean,

            f"SUCESSO | Quantidade: {len(computadores)}"

        )



        return {

            "username": username_clean,

            "user_dn": user_dn,

            "count": len(computadores),

            "data": computadores

        }



    finally:

        conn.unbind()





@app.get("/dashboard/xupervisor-status")
def get_xupervisor_status(
    creds: dict = Depends(get_current_credentials)
):
    base_dir = os.path.dirname(
        os.path.abspath(__file__)
    )

    export_status_file = os.path.join(
        base_dir,
        "logs",
        "xupervisor",
        "status.json"
    )

    sync_status_file = os.path.join(
        base_dir,
        "logs",
        "xupervisor",
        "sync_status.json"
    )

    lock_file = os.path.join(
        base_dir,
        "logs",
        "xupervisor",
        "sync.lock"
    )

    database_file = os.path.join(
        base_dir,
        "database",
        "xupervisor_inventory.db"
    )

    def read_status_file(file_path):
        if not os.path.isfile(file_path):
            return None

        try:
            with open(
                file_path,
                "r",
                encoding="utf-8-sig"
            ) as handle:
                data = json.load(handle)

            if isinstance(data, dict):
                return data

        except Exception:
            return {
                "status": "invalid",
                "message": (
                    "Arquivo de status invalido."
                )
            }

        return None

    export_status = read_status_file(
        export_status_file
    )

    sync_status = read_status_file(
        sync_status_file
    )

    database_exists = os.path.isfile(
        database_file
    )

    database_integrity = "unavailable"
    current_rows = 0
    rows_with_mac = 0
    rows_with_multiple_mac = 0
    database_size_bytes = 0

    if database_exists:
        database_size_bytes = os.path.getsize(
            database_file
        )

        connection = None

        try:
            database_uri = (
                "file:"
                + database_file.replace(
                    "\\",
                    "/"
                )
                + "?mode=ro"
            )

            connection = sqlite3.connect(
                database_uri,
                uri=True,
                timeout=5
            )

            database_integrity = (
                connection.execute(
                    "PRAGMA integrity_check"
                ).fetchone()[0]
            )

            current_rows = (
                connection.execute(
                    """
                    SELECT COUNT(1)
                    FROM inventory_current
                    """
                ).fetchone()[0]
            )

            rows_with_mac = (
                connection.execute(
                    """
                    SELECT COUNT(1)
                    FROM inventory_current
                    WHERE mac_addresses IS NOT NULL
                    """
                ).fetchone()[0]
            )

            rows_with_multiple_mac = (
                connection.execute(
                    """
                    SELECT COUNT(1)
                    FROM inventory_current
                    WHERE instr(mac_addresses, ';') > 0
                    """
                ).fetchone()[0]
            )

        except sqlite3.Error:
            database_integrity = "error"

        finally:
            if connection is not None:
                connection.close()

    sync_running = os.path.isfile(
        lock_file
    )

    export_ok = bool(
        export_status
        and str(
            export_status.get("status")
            or ""
        ).lower() in (
            "success",
            "sucesso"
        )
    )

    sync_ok = bool(
        sync_status
        and str(
            sync_status.get("status")
            or ""
        ).lower() in (
            "success",
            "sucesso"
        )
    )

    healthy = bool(
        database_exists
        and database_integrity == "ok"
        and current_rows > 0
        and export_ok
        and sync_ok
    )

    return {
        "status": (
            "healthy"
            if healthy
            else "degraded"
        ),
        "generated_at": datetime.now().isoformat(
            timespec="seconds"
        ),
        "database": {
            "exists": database_exists,
            "integrity": database_integrity,
            "size_bytes": database_size_bytes,
            "current_rows": current_rows,
            "rows_with_mac": rows_with_mac,
            "rows_with_multiple_mac": (
                rows_with_multiple_mac
            )
        },
        "synchronization": {
            "running": sync_running,
            "export": export_status,
            "publication": sync_status
        }
    }


@app.get("/computers/{hostname}/xupervisor")

def get_xupervisor_computer(

    hostname: str,

    creds: dict = Depends(get_current_credentials)

):

    hostname_clean = (

        hostname

        .strip()

        .split(".")[0]

        .rstrip("$")

        .upper()

    )



    if not hostname_clean:

        raise HTTPException(

            status_code=400,

            detail="Hostname nao informado."

        )



    base_dir = os.path.dirname(

        os.path.abspath(__file__)

    )



    database_file = os.path.join(

        base_dir,

        "database",

        "xupervisor_inventory.db"

    )



    if not os.path.isfile(database_file):

        AuditLogger.log(

            creds["username"],

            "ConsultarInventarioXupervisor",

            hostname_clean,

            "ERRO | Banco do Xupervisor nao encontrado"

        )



        raise HTTPException(

            status_code=503,

            detail=(

                "Banco de inventario do Xupervisor "

                "nao esta disponivel."

            )

        )



    database_uri = (

        "file:"

        + database_file.replace("\\", "/")

        + "?mode=ro"

    )



    connection = None



    try:

        connection = sqlite3.connect(

            database_uri,

            uri=True,

            timeout=10

        )



        connection.row_factory = sqlite3.Row

        cursor = connection.cursor()



        row = cursor.execute(

            """

            SELECT

                hostname,

                computer_name_raw,

                manufacturer,

                model,

                organization,

                server,

                operating_system,

                status,

                last_scanned,

                has_agent,

                bios_version,

                department,

                ip_address,

                primary_user,

                last_logged_on_user,

                serial_number,

                total_local_users,

                total_ram_gb,

                total_storage_gb,

                mac_addresses,

                source_row,

                imported_at,

                source_file,

                source_sha256,

                selection_rule

            FROM inventory_current

            WHERE hostname = ?

            LIMIT 1

            """,

            (hostname_clean,)

        ).fetchone()



        if row is None:

            AuditLogger.log(

                creds["username"],

                "ConsultarInventarioXupervisor",

                hostname_clean,

                "NAO ENCONTRADO"

            )



            raise HTTPException(

                status_code=404,

                detail=(

                    "Computador nao encontrado "

                    "no inventario do Xupervisor."

                )

            )



        data = {

            "Hostname": row["hostname"],

            "ComputerName": row["computer_name_raw"],

            "Manufacturer": row["manufacturer"],

            "Model": row["model"],

            "Organization": row["organization"],

            "Server": row["server"],

            "OperatingSystem": row["operating_system"],

            "Status": row["status"],

            "LastScanned": row["last_scanned"],

            "HasAgent": row["has_agent"],

            "BiosVersion": row["bios_version"],

            "Department": row["department"],

            "IPAddress": row["ip_address"],

            "PrimaryUser": row["primary_user"],

            "LastLoggedOnUser": row["last_logged_on_user"],

            "SerialNumber": row["serial_number"],

            "TotalLocalUsers": row["total_local_users"],

            "TotalRamGB": row["total_ram_gb"],

            "TotalStorageGB": row["total_storage_gb"],

            "MacAddresses": row["mac_addresses"],

            "ImportedAt": row["imported_at"],

            "SelectionRule": row["selection_rule"]

        }



        AuditLogger.log(

            creds["username"],

            "ConsultarInventarioXupervisor",

            hostname_clean,

            (

                "SUCESSO | "

                f"Last Scanned: {row['last_scanned']}"

            )

        )



        return {

            "found": True,

            "source": "Xupervisor",

            "hostname": hostname_clean,

            "data": data

        }



    except HTTPException:

        raise



    except sqlite3.Error as error:

        AuditLogger.log(

            creds["username"],

            "ConsultarInventarioXupervisor",

            hostname_clean,

            f"ERRO SQLITE | {type(error).__name__}"

        )



        raise HTTPException(

            status_code=503,

            detail=(

                "Falha ao consultar o banco "

                "de inventario do Xupervisor."

            )

        )



    finally:

        if connection is not None:

            connection.close()





@app.post("/users/{username}/toggle-status")

def toggle_account_status(username: str, creds: dict = Depends(get_current_credentials)):

    conn = get_ldap_connection(creds)

    try:

        conn.search(creds['search_base'], f"(sAMAccountName={username})", attributes=['userAccountControl'])

        if not conn.entries:

            raise HTTPException(status_code=404, detail="Objeto não encontrado no AD.")

            

        entry = conn.entries[0]

        uac = entry.userAccountControl.value if 'userAccountControl' in entry else 512

        is_disabled = bool(uac & 2)

        new_uac = (uac & ~2) if is_disabled else (uac | 2)

        

        success = conn.modify(entry.entry_dn, {'userAccountControl': [(ldap3.MODIFY_REPLACE, [new_uac])]})

        if not success:

            raise HTTPException(status_code=400, detail=f"Bloqueado pelo AD: {conn.result['description']}")

            

        AuditLogger.log(creds["username"], "AlternarStatus", username, "SUCESSO")

        invalidate_search_cache()

        return {"message": "Status alterado com sucesso."}

    finally:

        conn.unbind()



@app.post("/users/{username}/edit-profile")

def edit_profile(

    username: str,

    payload: ProfileEdit,

    creds: dict = Depends(get_current_credentials)

):

    conn = get_ldap_connection(creds)



    try:

        conn.search(

            creds['search_base'],

            f"(sAMAccountName={username})",

            search_scope=SUBTREE,

            attributes=[

                'distinguishedName',

                'objectClass'

            ]

        )



        if not conn.entries:

            raise HTTPException(

                status_code=404,

                detail="Objeto nao encontrado no Active Directory."

            )



        entry = conn.entries[0]

        target_dn = entry.entry_dn



        object_classes = (

            [

                str(valor).lower()

                for valor in entry.objectClass.values

            ]

            if entry.objectClass

            else []

        )



        is_computer = "computer" in object_classes

        is_group = "group" in object_classes

        is_user = not is_computer and not is_group



        changes = {}



        if is_user:

            if payload.title:

                changes['title'] = [

                    (

                        ldap3.MODIFY_REPLACE,

                        [payload.title.strip()]

                    )

                ]



            if payload.department:

                changes['department'] = [

                    (

                        ldap3.MODIFY_REPLACE,

                        [payload.department.strip()]

                    )

                ]



            if payload.telephone:

                changes['telephoneNumber'] = [

                    (

                        ldap3.MODIFY_REPLACE,

                        [payload.telephone.strip()]

                    )

                ]



        if payload.description is not None:

            description = payload.description.strip()



            if description:

                changes['description'] = [

                    (

                        ldap3.MODIFY_REPLACE,

                        [description]

                    )

                ]

            else:

                changes['description'] = [

                    (

                        ldap3.MODIFY_DELETE,

                        []

                    )

                ]



        if payload.manager_dn is not None:

            responsible_dn = payload.manager_dn.strip()



            relation_attribute = (

                'managedBy'

                if is_computer or is_group

                else 'manager'

            )



            if not responsible_dn:

                changes[relation_attribute] = [

                    (

                        ldap3.MODIFY_DELETE,

                        []

                    )

                ]

            else:

                try:

                    responsible_found = conn.search(

                        responsible_dn,

                        "(&(objectClass=user)(!(objectClass=computer)))",

                        search_scope=BASE,

                        attributes=[

                            'distinguishedName',

                            'displayName',

                            'sAMAccountName'

                        ]

                    )

                except Exception:

                    responsible_found = False



                if not responsible_found or not conn.entries:

                    raise HTTPException(

                        status_code=400,

                        detail=(

                            "O usuario selecionado como responsavel "

                            "nao foi encontrado no dominio."

                        )

                    )



                responsible_entry = conn.entries[0]

                responsible_real_dn = responsible_entry.entry_dn



                if responsible_real_dn.lower() == target_dn.lower():

                    raise HTTPException(

                        status_code=400,

                        detail=(

                            "O proprio objeto nao pode ser definido "

                            "como responsavel."

                        )

                    )



                changes[relation_attribute] = [

                    (

                        ldap3.MODIFY_REPLACE,

                        [responsible_real_dn]

                    )

                ]



        if not changes:

            return {

                "message": "Nenhuma alteracao foi informada."

            }



        success = conn.modify(

            target_dn,

            changes

        )



        if not success:

            erro_ad = (

                conn.result.get('message')

                or conn.result.get('description')

                or "Falha desconhecida"

            )



            AuditLogger.log(

                creds["username"],

                "EditarPerfil",

                username,

                f"FALHA: {erro_ad}"

            )



            raise HTTPException(

                status_code=400,

                detail=f"Erro ao editar objeto no AD: {erro_ad}"

            )



        campos = ", ".join(

            sorted(changes.keys())

        )



        tipo_objeto = (

            "Computer"

            if is_computer

            else "Group"

            if is_group

            else "User"

        )



        AuditLogger.log(

            creds["username"],

            "EditarPerfil",

            username,

            f"SUCESSO | Tipo: {tipo_objeto} | Campos: {campos}"

        )



        invalidate_search_cache()

        return {

            "message": "Registro atualizado com sucesso.",

            "object_type": tipo_objeto,

            "updated_fields": sorted(changes.keys())

        }



    finally:

        conn.unbind()



@app.post("/users/{username}/unlock")

def unlock_user(username: str, creds: dict = Depends(get_current_credentials)):

    conn = get_ldap_connection(creds)

    try:

        conn.search(creds['search_base'], f"(sAMAccountName={username})")

        if not conn.entries:

            raise HTTPException(status_code=404, detail="Objeto não encontrado.")

        

        entry = conn.entries[0]

        success = conn.modify(entry.entry_dn, {'lockoutTime': [(ldap3.MODIFY_REPLACE, [0])]})

        

        if not success:

            raise HTTPException(status_code=400, detail=f"Bloqueado pelo AD: {conn.result['description']}")

            

        AuditLogger.log(creds["username"], "Desbloquear", username, "SUCESSO")

        invalidate_search_cache()

        return {"message": f"Usuário {username} desbloqueado."}

    finally:

        conn.unbind()



def _ps_quote(value):
    text = str(value)
    for q in ("'", "\u2018", "\u2019", "\u201a", "\u201b"):
        text = text.replace(q, q + q)
    return text


@app.post("/users/{username}/reset-password")

def reset_password(username: str, payload: PasswordReset, creds: dict = Depends(get_current_credentials)):

    # Reconstruído em PowerShell para contornar o bloqueio de Política de Senha do AD

    script = f"$Password = ConvertTo-SecureString '{_ps_quote(payload.new_password)}' -AsPlainText -Force; "

    script += f"Set-ADAccountPassword -Identity '{_ps_quote(username)}' -NewPassword $Password -Reset:$true -Credential $mycreds; "

    

    if payload.unlock_account:

        script += f"Unlock-ADAccount -Identity '{_ps_quote(username)}' -Credential $mycreds; "

        

    if payload.force_change:

        script += f"Set-ADUser -Identity '{_ps_quote(username)}' -ChangePasswordAtLogon $true -Credential $mycreds; "

    else:

        script += f"Set-ADUser -Identity '{_ps_quote(username)}' -ChangePasswordAtLogon $false -Credential $mycreds; "

        

    run_powershell(script, creds, return_json=False)

    AuditLogger.log(creds["username"], "ResetSenha", username, f"Desbloqueio: {payload.unlock_account} | ForceChange: {payload.force_change}")

    invalidate_search_cache()

    return {"message": f"Credenciais de {username} atualizadas com sucesso."}



@app.post("/users/{username}/force-change")

def toggle_force_change(username: str, payload: ForceChangeUpdate, creds: dict = Depends(get_current_credentials)):

    # PowerShell garante que o Active Directory obedeça à regra de Desativar

    bool_str = "$true" if payload.force else "$false"

    script = f"Set-ADUser -Identity '{username}' -ChangePasswordAtLogon {bool_str} -Credential $mycreds"

    

    run_powershell(script, creds, return_json=False)

    AuditLogger.log(creds["username"], "ToggleTrocaSenha", username, f"Forcar: {payload.force}")

    invalidate_search_cache()

    return {"message": "Configuração alterada com sucesso!"}



# --- LISTAGEM DE OUs E MOVIMENTAÇÃO DE OBJETOS ---



@app.get("/ous")

def list_ous(creds: dict = Depends(get_current_credentials)):

    conn = get_ldap_connection(creds)

    try:

        conn.search(

            creds['search_base'], 

            "(objectClass=organizationalUnit)", 

            search_scope=SUBTREE, 

            attributes=['ou']

        )

        ous = [{"dn": entry.entry_dn, "ou": entry.ou.value if 'ou' in entry else entry.entry_dn} for entry in conn.entries]

        return {"data": ous}

    finally:

        conn.unbind()



@app.post("/users/{username}/move")

def move_object(username: str, payload: MoveObject, creds: dict = Depends(get_current_credentials)):

    conn = get_ldap_connection(creds)

    try:

        conn.search(creds['search_base'], f"(sAMAccountName={username})", attributes=['cn'])

        if not conn.entries:

            raise HTTPException(status_code=404, detail="Objeto não encontrado.")

            

        entry = conn.entries[0]

        success = conn.modify_dn(entry.entry_dn, f"CN={entry.cn}", new_superior=payload.new_ou)

        

        if not success:

            raise HTTPException(status_code=400, detail=f"Falha ao mover objeto: {conn.result['description']}")

            

        AuditLogger.log(creds["username"], "MoverOU", username, f"Destino: {payload.new_ou}")

        invalidate_search_cache()

        return {"message": "Objeto movido com sucesso."}

    finally:

        conn.unbind()



# --- OPERAÇÕES EM LOTE (BULK ACTIONS) ---



@app.post("/bulk/{action}")

def bulk_operations(action: str, payload: BulkAction, creds: dict = Depends(get_current_credentials)):

    if action not in ["unlock", "enable", "disable"]:

        raise HTTPException(status_code=400, detail="Ação em lote inválida.")

        

    conn = get_ldap_connection(creds)

    try:

        success_count = 0

        errors = []

        

        for user in payload.usernames:

            try:

                conn.search(creds['search_base'], f"(sAMAccountName={user})", attributes=['userAccountControl'])

                if not conn.entries:

                    errors.append({"user": user, "error": "Login não encontrado no AD"})

                    continue

                    

                entry = conn.entries[0]

                

                if action == "unlock":

                    success = conn.modify(entry.entry_dn, {'lockoutTime': [(ldap3.MODIFY_REPLACE, [0])]})

                elif action in ["enable", "disable"]:

                    uac = entry.userAccountControl.value if 'userAccountControl' in entry else 512

                    is_disabled = bool(uac & 2)

                    new_uac = (uac & ~2) if action == "enable" else (uac | 2)

                    success = conn.modify(entry.entry_dn, {'userAccountControl': [(ldap3.MODIFY_REPLACE, [new_uac])]})

                    

                if success:

                    success_count += 1

                    invalidate_search_cache()

                else:

                    errors.append({"user": user, "error": conn.result['description']})

            except Exception as e:

                errors.append({"user": user, "error": str(e)})

                

        AuditLogger.log(creds["username"], f"Bulk_{action.capitalize()}", f"{len(payload.usernames)} objetos", f"Sucessos: {success_count}")

        return {"success_count": success_count, "total": len(payload.usernames), "errors": errors}

    finally:

        conn.unbind()



@app.post("/bulk/computers/{action}")
def bulk_computer_operations(
    action: str,
    payload: BulkAction,
    creds: dict = Depends(get_current_credentials)
):
    if action not in (
        "enable",
        "disable"
    ):
        raise HTTPException(
            status_code=400,
            detail="Acao em lote invalida para computadores."
        )

    computer_names = tuple(
        str(item).strip().rstrip("$")
        for item in payload.usernames
        if str(item).strip()
    )

    if not computer_names:
        raise HTTPException(
            status_code=400,
            detail="Nenhum computador informado."
        )

    connection = get_ldap_connection(
        creds
    )

    success_count = 0
    errors = []
    results = []

    try:
        for computer_name in computer_names:
            try:
                sam_account_name = (
                    computer_name
                    + "$"
                )

                escaped_name = (
                    ldap3.utils.conv.escape_filter_chars(
                        sam_account_name
                    )
                )

                connection.search(
                    creds["search_base"],
                    (
                        "(&(objectClass=computer)"
                        "(sAMAccountName="
                        + escaped_name
                        + "))"
                    ),
                    attributes=(
                        "userAccountControl",
                        "sAMAccountName",
                        "objectClass"
                    )
                )

                if not connection.entries:
                    message = (
                        "Computador nao encontrado no AD."
                    )

                    errors.append(
                        {
                            "computer": computer_name,
                            "error": message
                        }
                    )

                    results.append(
                        {
                            "computer": computer_name,
                            "success": False,
                            "message": message
                        }
                    )

                    continue

                entry = connection.entries[0]

                object_classes = tuple(
                    str(value).lower()
                    for value in entry.objectClass.values
                )

                if "computer" not in object_classes:
                    message = (
                        "O objeto localizado nao e um computador."
                    )

                    errors.append(
                        {
                            "computer": computer_name,
                            "error": message
                        }
                    )

                    results.append(
                        {
                            "computer": computer_name,
                            "success": False,
                            "message": message
                        }
                    )

                    continue

                current_uac = (
                    int(entry.userAccountControl.value)
                    if "userAccountControl" in entry
                    and entry.userAccountControl.value is not None
                    else 4096
                )

                if action == "enable":
                    new_uac = current_uac & ~2
                    success_message = (
                        "Computador ativado."
                    )
                else:
                    new_uac = current_uac | 2
                    success_message = (
                        "Computador desativado."
                    )

                success = connection.modify(
                    entry.entry_dn,
                    {
                        "userAccountControl": (
                            (
                                ldap3.MODIFY_REPLACE,
                                (
                                    new_uac,
                                )
                            ),
                        )
                    }
                )

                if success:
                    success_count += 1

                    results.append(
                        {
                            "computer": computer_name,
                            "success": True,
                            "message": success_message
                        }
                    )
                else:
                    message = str(
                        connection.result.get(
                            "description"
                        )
                        or "Falha ao alterar o computador."
                    )

                    errors.append(
                        {
                            "computer": computer_name,
                            "error": message
                        }
                    )

                    results.append(
                        {
                            "computer": computer_name,
                            "success": False,
                            "message": message
                        }
                    )

            except Exception as item_error:
                message = str(item_error)

                errors.append(
                    {
                        "computer": computer_name,
                        "error": message
                    }
                )

                results.append(
                    {
                        "computer": computer_name,
                        "success": False,
                        "message": message
                    }
                )

        invalidate_search_cache()

        AuditLogger.log(
            creds["username"],
            (
                "BulkComputer_"
                + action.capitalize()
            ),
            (
                str(len(computer_names))
                + " computadores"
            ),
            (
                "Sucessos: "
                + str(success_count)
            )
        )

        return {
            "action": action,
            "success_count": success_count,
            "error_count": len(errors),
            "total": len(computer_names),
            "errors": errors,
            "results": results
        }

    finally:
        connection.unbind()


# --- GRUPOS LOCAIS DE MÁQUINAS (WINRM) ---



@app.get("/computers/{hostname}/local-groups")

def get_computer_local_groups(hostname: str, creds: dict = Depends(get_current_credentials)):

    network_target = hostname.rstrip('$')

    

    if "." not in network_target:

        network_target = f"{network_target}.{creds['domain']}"

    

    script_block = (

        "$groups = Get-LocalGroup -ErrorAction SilentlyContinue; "

        "if (-not $groups) { return @() }; "

        "$res = @(); "

        "foreach ($g in $groups) { "

        "  $members = Get-LocalGroupMember -Group $g.Name -ErrorAction SilentlyContinue; "

        "  if ($members) { "

        "    foreach ($m in $members) { "

        "      $res += [PSCustomObject]@{ Grupo=$g.Name; Membro=$m.Name }; "

        "    } "

        "  } "

        "} "

        "return $res"

    )

    script = (

        f"$so = New-PSSessionOption -OpenTimeout 10000 -OperationTimeout 20000; "

        f"Invoke-Command -ComputerName '{network_target}' -SessionOption $so -ScriptBlock {{ {script_block} }} -Credential $mycreds"

    )

    

    data = run_powershell(script, creds, return_json=True)

    AuditLogger.log(creds["username"], "ConsultarGruposLocais", network_target, "SUCESSO")

    return {"data": data}



class CompareUsers(BaseModel):

    usernames: list[str]



# ==========================================================

# 4. CLONAGEM DE PERFIL (ESPELHO DE GRUPOS)

# ==========================================================

class CloneGroupsPayload(BaseModel):

    source_user: str



@app.post("/users/{username}/clone-groups")

def clone_user_groups(username: str, payload: CloneGroupsPayload, creds: dict = Depends(get_current_credentials)):

    conn = get_ldap_connection(creds)

    try:

        # 1. Encontra o DN do usuário DESTINO

        conn.search(creds['search_base'], f"(sAMAccountName={username})")

        if not conn.entries:

            raise HTTPException(status_code=404, detail=f"Usuário destino '{username}' não encontrado.")

        target_dn = conn.entries[0].entry_dn



        # 2. Encontra o usuário ORIGEM

        conn.search(creds['search_base'], f"(sAMAccountName={payload.source_user})", attributes=['memberOf'])

        if not conn.entries:

            raise HTTPException(status_code=404, detail=f"Usuário de origem '{payload.source_user}' não localizado no AD.")

        

        source_entry = conn.entries[0]

        source_groups = source_entry.memberOf.values if 'memberOf' in source_entry and source_entry.memberOf else []



        if not source_groups:

            return {"message": f"O usuário {payload.source_user} possui apenas o grupo primário. Não há acessos extras para clonar."}



        # 3. Injeta o usuário destino e faz o pente-fino das respostas do AD

        sucessos = 0

        ja_existentes = 0

        erros = []

        

        for group_dn in source_groups:

            # Pega o nome do grupo amigável para mostrar nos erros

            group_name = str(group_dn).split(',')[0].replace('CN=', '')

            

            try:

                success = conn.modify(group_dn, {'member': [(ldap3.MODIFY_ADD, [target_dn])]})

                res_code = conn.result.get('result', -1)

                

                if success or res_code == 0:

                    sucessos += 1

                    invalidate_search_cache()

                elif res_code == 68 or 'entryAlreadyExists' in str(conn.result):

                    # Código 68: O usuário destino JÁ É membro deste grupo

                    ja_existentes += 1

                else:

                    # Ocorreu uma falha real (Ex: AD negou permissão - insufficientAccessRights)

                    desc_erro = conn.result.get('description', 'Erro Desconhecido')

                    erros.append(f"{group_name} ({desc_erro})")

            except Exception as e:

                erros.append(f"{group_name} (Falha)")



        # 4. Monta a mensagem de resposta detalhada

        msg = f"Espelho concluído! {sucessos} novos acessos concedidos."

        if ja_existentes > 0:

            msg += f" O colaborador já possuía {ja_existentes} destes grupos."

        if erros:

            msg += f" Falha em {len(erros)} grupos: {', '.join(erros[:3])}" + ("..." if len(erros) > 3 else "")



        AuditLogger.log(creds["username"], "ClonarPerfil", f"Origem: {payload.source_user} -> Destino: {username}", f"Add: {sucessos} | Já Tinha: {ja_existentes} | Erros: {len(erros)}")

        return {"message": msg}

    finally:

        conn.unbind()



# --- MÓDULO 6: DIAGNÓSTICOS REMOTOS (PING, WMI, SPLUNK) ---



@app.get("/diagnostics/{target}/{diag_type}")

def run_diagnostics(target: str, diag_type: str, creds: dict = Depends(get_current_credentials)):

    if not re.match(r"^[a-zA-Z0-9.\-_$: ]+$", target):

        raise HTTPException(status_code=400, detail="Alvo inválido.")

        

    network_target = target.rstrip('$').lower()

    network_target = network_target.replace("print:", "").replace("prn:", "").strip()

    

    if ":" in network_target:

        network_target = network_target.split(":")[0].strip()

    

    if "." not in network_target and not network_target.replace(".", "").isdigit():

        network_target = f"{network_target}.{creds['domain']}"

        

    if diag_type == "ping":

        script = f"Test-Connection -ComputerName '{network_target}' -Count 4 -ErrorAction SilentlyContinue | Format-Table Address, IPv4Address, ResponseTime"

    elif diag_type == "wmi":

        script = (

            f"Invoke-Command -ComputerName '{network_target}' -Credential $mycreds -ScriptBlock {{ "

            f"Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue | Select-Object LastBootUpTime | Format-List | Out-String; "

            f"Get-CimInstance Win32_ComputerSystem -ErrorAction SilentlyContinue | Select-Object UserName, TotalPhysicalMemory, Manufacturer, Model | Format-List | Out-String; "

            f"Write-Output '--- ARMAZENAMENTO (DISCO C:) ---'; "

            f"Get-CimInstance Win32_LogicalDisk -ErrorAction SilentlyContinue | Where-Object DeviceID -eq 'C:' | Select-Object DeviceID, @{{Name='Livre(GB)';Expression={{[math]::Round($_.FreeSpace/1GB,2)}}}}, @{{Name='Total(GB)';Expression={{[math]::Round($_.Size/1GB,2)}}}} | Format-Table -AutoSize | Out-String; "

            f"Write-Output '--- TOP 5 PROCESSOS (CPU / RAM) ---'; "

            f"Get-Process | Sort-Object CPU -Descending | Select-Object -First 5 Name, Id, CPU, @{{Name='RAM(MB)';Expression={{[math]::Round($_.WorkingSet/1MB,2)}}}} | Format-Table -AutoSize | Out-String "

            f"}}"

        )

    elif diag_type == "splunk":

        # Resolve o IP dinamicamente para o Splunk também

        pdc_ip = creds['server'] 

        if not pdc_ip or pdc_ip.upper() == 'AUTO':

            pdc_ip = socket.gethostbyname(creds['domain'])

            

        nome_limpo = target.rstrip('$').strip()

        script = (

            f"Invoke-Command -ComputerName '{pdc_ip}' -Credential $mycreds -ScriptBlock {{ "

            f"Get-WinEvent -FilterHashtable @{{LogName='Security'; Id=4740}} -MaxEvents 50 -ErrorAction SilentlyContinue | "

            f"Where-Object {{$_.Properties[0].Value -eq '{nome_limpo}'}} | Format-List TimeCreated, Message "

            f"}}"

        )

    else:

        raise HTTPException(status_code=400, detail="Diagnóstico desconhecido.")

        

    domain_netbios = creds['domain'].split('.')[0]

    auth_prefix = (

        f"$secpasswd = ConvertTo-SecureString '{creds['password']}' -AsPlainText -Force; "

        f"$mycreds = New-Object System.Management.Automation.PSCredential ('{domain_netbios}\\{creds['username']}', $secpasswd); "

    )

    

    full_command = f"{auth_prefix} {script}"

    

    try:

        result = subprocess.run(["powershell", "-ExecutionPolicy", "Bypass", "-NoProfile", "-Command", full_command], capture_output=True, text=True, encoding='cp850', errors='replace')

        output = result.stderr.strip() if result.returncode != 0 and result.stderr else result.stdout.strip()

        

        if not output and diag_type == "splunk":

            output = f"Nenhum evento de bloqueio recente (4740) encontrado para o usuário {target} no PDC."

        elif not output:

            output = f"Falha na comunicação. O host {network_target} pode estar offline ou bloqueando WinRM/ICMP."

            

        AuditLogger.log(creds["username"], f"Diag_{diag_type.upper()}", target, "EXECUTADO")

        return {"output": output}

    except Exception as e:

        return {"output": f"Erro crítico ao executar subprocesso: {str(e)}"}



@app.post("/computers/{hostname}/kill/{pid}")

def kill_remote_process(hostname: str, pid: int, creds: dict = Depends(get_current_credentials)):

    network_target = hostname.rstrip('$').lower()

    if "." not in network_target:

        network_target = f"{network_target}.{creds['domain']}"

        

    script_block = f"Stop-Process -Id {pid} -Force"

    script = (

        f"$so = New-PSSessionOption -OpenTimeout 10000 -OperationTimeout 20000; "

        f"Invoke-Command -ComputerName '{network_target}' -SessionOption $so -ScriptBlock {{ {script_block} }} -Credential $mycreds"

    )

    

    try:

        run_powershell(script, creds, return_json=False)

        AuditLogger.log(creds["username"], "KillProcess", f"{network_target} (PID: {pid})", "SUCESSO")

        return {"message": f"Processo {pid} encerrado com sucesso no ativo {network_target}."}

    except Exception as e:

        raise HTTPException(status_code=400, detail=f"Falha ao encerrar processo. O PID pode não existir ou acesso foi negado.")



# --- MÓDULO 7: COMPARADOR HOLÍSTICO DE PERMISSÕES ---



@app.post("/compare")

def compare_users(payload: CompareUsers, creds: dict = Depends(get_current_credentials)):

    conn = get_ldap_connection(creds)

    try:

        users_data = {}

        for u in payload.usernames:

            conn.search(creds['search_base'], f"(sAMAccountName={u})", search_scope=SUBTREE, attributes=['sAMAccountName', 'displayName', 'title', 'memberOf'])

            if conn.entries:

                entry = conn.entries[0]

                groups = set(str(g).split(',')[0].replace('CN=', '') for g in entry.memberOf.values) if ('memberOf' in entry and entry.memberOf) else set()

                users_data[u] = {

                    "DisplayName": entry.displayName.value if 'displayName' in entry and entry.displayName else u,

                    "Title": entry.title.value if 'title' in entry and entry.title else "N/A",

                    "Groups": list(groups)

                }



        if not users_data:

            raise HTTPException(status_code=404, detail="Nenhum usuário válido encontrado no AD.")



        all_sets = [set(data["Groups"]) for data in users_data.values()]

        common_groups = set.intersection(*all_sets) if all_sets else set()



        for u, data in users_data.items():

            data["ExclusiveGroups"] = sorted(list(set(data["Groups"]) - common_groups))

            del data["Groups"] 



        AuditLogger.log(creds["username"], "ComparadorGeral", f"{len(payload.usernames)} usuários", "SUCESSO")

        return {

            "common_groups": sorted(list(common_groups)),

            "users": users_data

        }

    finally:

        conn.unbind()



# --- MÓDULO 8: INTEGRAÇÃO VETORH (SQL SERVER) ---



class VetorhUpdate(BaseModel):

    matriculas: list[str]

    tipcol: int = 1

    techacc: str



def get_db_connection():

    server = r'PTU-SQL-03\SQLSEN' 

    database = 'DKBMVETORHPD0' 

    

    drivers_instalados = pyodbc.drivers()

    driver_escolhido = '{SQL Server}'

    

    if 'ODBC Driver 17 for SQL Server' in drivers_instalados: 

        driver_escolhido = '{ODBC Driver 17 for SQL Server}'

    elif 'ODBC Driver 13 for SQL Server' in drivers_instalados: 

        driver_escolhido = '{ODBC Driver 13 for SQL Server}'

    elif 'SQL Server Native Client 11.0' in drivers_instalados: 

        driver_escolhido = '{SQL Server Native Client 11.0}'



    connection_string = f'DRIVER={driver_escolhido};SERVER={server};DATABASE={database};Trusted_Connection=yes;'

    return pyodbc.connect(connection_string, timeout=10)



@app.get("/vetorh/{matricula}")

def get_vetorh_access(matricula: str, creds: dict = Depends(get_current_credentials)):

    try:

        mat_int = int(matricula)

        conn = get_db_connection()

        cursor = conn.cursor()

        

        # A sua query exata com LEFT JOIN

        query = """

            SELECT fun.numemp, fun.tipcol, fun.numcad, fun.nomfun, cpl.usu_addisname, 

                   fun.sitafa, cpl.usu_igadigid, cpl.usu_networkid, cpl.emacom, cpl.emapar, cpl.usu_techacc

            FROM vetorh.r034fun fun 

            LEFT JOIN vetorh.r034cpl cpl ON (fun.numemp = cpl.numemp AND fun.tipcol = cpl.tipcol AND fun.numcad = cpl.numcad)

            WHERE fun.numcad = ?

        """

        cursor.execute(query, mat_int)

        row = cursor.fetchone()

        

        cursor.close()

        conn.close()

        

        if row:

            sitafa_code = int(row[5]) if row[5] is not None else None

            

            # Dicionário de tradução do código SITAFA

            sitafa_map = {

                1: "1 - Trabalhando", 

                2: "2 - Férias", 

                3: "3 - Afastamento", 

                7: "7 - Afastamento", 

                16: "16 - Afastamento", 

                22: "22 - Demitido", 

                35: "35 - Afastamento", 

                50: "50 - Afastamento", 

                61: "61 - Afastamento", 

                64: "64 - Afastamento"

            }

            sitafa_desc = sitafa_map.get(sitafa_code, f"Outro ({sitafa_code})") if sitafa_code is not None else "Não Informado"



            return {

                "numemp": row[0],

                "tipcol": int(row[1]) if row[1] else 1,

                "numcad": row[2],

                "nomfun": str(row[3]).strip() if row[3] else "",

                "usu_addisname": str(row[4]).strip() if row[4] else "",

                "sitafa": sitafa_desc,

                "igadigid": str(row[6]).strip() if row[6] else "N/A",

                "networkid": str(row[7]).strip() if row[7] else "",

                "emacom": str(row[8]).strip() if row[8] else "",

                "emapar": str(row[9]).strip() if row[9] else "",

                "techacc": str(row[10]).strip() if row[10] else "NTU"

            }

            

        return {"techacc": "NTU", "tipcol": 1, "sitafa": "Desconhecido", "igadigid": "N/A", "message": "Sem Registro no DB"}

    except Exception as e:

        return {"techacc": "NTU", "tipcol": 1, "sitafa": "Erro SQL", "igadigid": "N/A", "error": f"Erro DB: {str(e)}"}



@app.get("/vetorh/search/{matriculas}")

def search_vetorh_bulk(matriculas: str, creds: dict = Depends(get_current_credentials)):

    try:

        # Pega a string (ex: "10452, 10453"), separa e converte apenas números válidos

        mat_list = [int(m.strip()) for m in re.split(r'[,;\n\s]+', matriculas) if m.strip().isdigit()]

        

        if not mat_list:

            return {"data": []}

            

        conn = get_db_connection()

        cursor = conn.cursor()

        

        # Prepara os placeholders para a consulta IN (?, ?, ?)

        placeholders = ','.join(['?'] * len(mat_list))

        

        query = f"""

            SELECT fun.numemp, fun.tipcol, fun.numcad, fun.nomfun, cpl.usu_addisname, 

                   fun.sitafa, cpl.usu_igadigid, cpl.usu_networkid, cpl.emacom, cpl.emapar, cpl.usu_techacc

            FROM vetorh.r034fun fun 

            LEFT JOIN vetorh.r034cpl cpl ON (fun.numemp = cpl.numemp AND fun.tipcol = cpl.tipcol AND fun.numcad = cpl.numcad)

            WHERE fun.numcad IN ({placeholders})

        """

        

        cursor.execute(query, mat_list)

        rows = cursor.fetchall()

        cursor.close()

        conn.close()

        

        sitafa_map = {

            1: "1 - Trabalhando", 2: "2 - Férias", 3: "3 - Afastamento", 7: "7 - Afastamento", 

            16: "16 - Afastamento", 22: "22 - Demitido", 35: "35 - Afastamento", 

            50: "50 - Afastamento", 61: "61 - Afastamento", 64: "64 - Afastamento"

        }

        

        results = []

        for row in rows:

            sitafa_code = int(row[5]) if row[5] is not None else None

            sitafa_desc = sitafa_map.get(sitafa_code, f"Outro ({sitafa_code})") if sitafa_code is not None else "Não Informado"

            

            results.append({

                "numemp": row[0],

                "tipcol": int(row[1]) if row[1] else 1,

                "numcad": row[2],

                "nomfun": str(row[3]).strip() if row[3] else "",

                "usu_addisname": str(row[4]).strip() if row[4] else "",

                "sitafa": sitafa_desc,

                "igadigid": str(row[6]).strip() if row[6] else "N/A",

                "networkid": str(row[7]).strip() if row[7] else "",

                "emacom": str(row[8]).strip() if row[8] else "",

                "emapar": str(row[9]).strip() if row[9] else "",

                "techacc": str(row[10]).strip() if row[10] else "NTU"

            })

            

        return {"data": results}

    except Exception as e:

        raise HTTPException(status_code=500, detail=f"Erro DB: {str(e)}")



@app.post("/vetorh/update")

def update_vetorh_access(payload: VetorhUpdate, creds: dict = Depends(get_current_credentials)):

    sucessos = 0

    erros = []

    try:

        conn = get_db_connection()

        cursor = conn.cursor()

        

        for mat in payload.matriculas:

            try:

                mat_int = int(mat)

                

                # 1. AUTOMAÇÃO INTELIGENTE: Busca o tipcol real do colaborador antes de qualquer coisa

                cursor.execute("SELECT tipcol FROM vetorh.r034fun WHERE numcad = ?", mat_int)

                row = cursor.fetchone()

                

                if not row:

                    erros.append({"matricula": mat, "error": "Matrícula não localizada no banco de dados."})

                    continue

                    

                tipcol_real = int(row[0])

                

                # 2. Executa a procedure injetando o tipcol correto descoberto na etapa 1

                query = "{CALL vetorh.SP_IntTITechAcc (?, ?, ?)}"

                cursor.execute(query, (tipcol_real, mat_int, payload.techacc))

                conn.commit()

                

                sucessos += 1

                AuditLogger.log(creds["username"], "UpdateVetorh", str(mat_int), f"SUCESSO: {payload.techacc} (Tipo Detectado: {tipcol_real})")

                

            except Exception as e:

                erros.append({"matricula": mat, "error": str(e)})

                

        cursor.close()

        conn.close()

        return {"success_count": sucessos, "errors": erros}

        

    except Exception as e:

        raise HTTPException(status_code=500, detail=f"Falha de conexão com o Banco: {str(e)}")



# --- MÓDULO 9: GESTÃO DE IMPRESSORAS (WINRM) ---



def formatar_fqdn(servidor: str, dominio_padrao: str) -> str:

    serv_limpo = servidor.lower().replace("print:", "").replace("prn:", "").strip()

    

    if ":" in serv_limpo:

        serv_limpo = serv_limpo.split(":")[0].strip()

        

    if "." not in serv_limpo and not serv_limpo.replace(".", "").isdigit():

        return f"{serv_limpo}.{dominio_padrao}"

    return serv_limpo



@app.get("/printers/{server}")

def list_printers(server: str, filter: str = "*", creds: dict = Depends(get_current_credentials)):

    servidor_real = server

    filtro_real = filter

    

    if ":" in server:

        partes = server.split(":")

        servidor_real = partes[0].strip()

        filtro_real = partes[1].strip()

        

    fqdn = formatar_fqdn(servidor_real, creds['domain'])

    termo = f"*{filtro_real}*" if filtro_real != "*" else "*"

    

    script_block = (

        f"@(Get-Printer -Name '{termo}' -ErrorAction SilentlyContinue | ForEach-Object {{ "

        "[PSCustomObject]@{ "

        "Name=[string]$_.Name; "

        "PrinterStatus=[string]$_.PrinterStatus; "

        "JobCount=[int]$_.JobCount; "

        "PortName=[string]$_.PortName; "

        "Location=[string]$_.Location; "

        "DriverName=[string]$_.DriverName "

        "} } )"

    )

    script = f"Invoke-Command -ComputerName '{fqdn}' -ScriptBlock {{ {script_block} }} -Credential $mycreds"

    

    data = run_powershell(script, creds, return_json=True)

    return {"data": data}



@app.post("/printers/{server}/{queue}/clear")

def clear_print_queue(server: str, queue: str, creds: dict = Depends(get_current_credentials)):

    fqdn = formatar_fqdn(server, creds['domain'])

    script = f"Invoke-Command -ComputerName '{fqdn}' -ScriptBlock {{ Get-PrintJob -PrinterName '{queue}' -ErrorAction SilentlyContinue | Remove-PrintJob }} -Credential $mycreds"

    run_powershell(script, creds, return_json=False)

    AuditLogger.log(creds["username"], "LimparFila", queue, f"SUCESSO (Server: {fqdn})")

    return {"message": "Fila esvaziada com sucesso."}



@app.post("/printers/{server}/restart-spooler")

def restart_spooler(server: str, creds: dict = Depends(get_current_credentials)):

    fqdn = formatar_fqdn(server, creds['domain'])

    script = f"Invoke-Command -ComputerName '{fqdn}' -ScriptBlock {{ Restart-Service Spooler -Force }} -Credential $mycreds"

    run_powershell(script, creds, return_json=False)

    AuditLogger.log(creds["username"], "RestartSpooler", fqdn, "SUCESSO")

    return {"message": "Serviço de Spooler reiniciado remotamente."}



# --- MÓDULO 10: SEGURANÇA AVANÇADA (LAPS E BITLOCKER) ---



@app.get("/computers/{hostname}/security")

def get_computer_security(hostname: str, creds: dict = Depends(get_current_credentials)):

    conn = get_ldap_connection(creds)

    try:

        network_target = hostname.rstrip('$')

        

        try:

            conn.search(

                creds['search_base'], 

                f"(sAMAccountName={network_target}$)", 

                attributes=['distinguishedName', 'ms-Mcs-AdmPwd', 'msLAPS-Password']

            )

        except ldap3.core.exceptions.LDAPAttributeError:

            conn.search(

                creds['search_base'], 

                f"(sAMAccountName={network_target}$)", 

                attributes=['distinguishedName', 'ms-Mcs-AdmPwd']

            )

        

        if not conn.entries:

            raise HTTPException(status_code=404, detail="Computador não localizado no domínio.")



        entry = conn.entries[0]

        comp_dn = entry.distinguishedName.value



        laps_pwd = "Sem permissão ou não configurado"

        if 'ms-Mcs-AdmPwd' in entry and entry['ms-Mcs-AdmPwd']:

            laps_pwd = str(entry['ms-Mcs-AdmPwd'].value)

        elif 'msLAPS-Password' in entry and entry['msLAPS-Password']:

            laps_pwd = str(entry['msLAPS-Password'].value)



        conn.search(

            comp_dn, 

            "(objectClass=msFVE-RecoveryInformation)", 

            search_scope=ldap3.SUBTREE, 

            attributes=['msFVE-RecoveryPassword', 'whenCreated']

        )

        

        bitlocker_keys = []

        for b_entry in conn.entries:

            if 'msFVE-RecoveryPassword' in b_entry and b_entry['msFVE-RecoveryPassword']:

                data_criacao = str(b_entry['whenCreated'].value)[:16] if 'whenCreated' in b_entry else "N/A"

                bitlocker_keys.append({

                    "key": str(b_entry['msFVE-RecoveryPassword'].value),

                    "date": data_criacao.replace('T', ' ')

                })



        bitlocker_keys.sort(key=lambda x: x['date'], reverse=True)

        AuditLogger.log(creds["username"], "ConsultarSeguranca", network_target, "LAPS/BitLocker extraídos")

        return {"laps": laps_pwd, "bitlocker": bitlocker_keys}

    finally:

        conn.unbind()



# ==========================================================

# 1. VISOR DE AUDITORIA (SQLITE)

# ==========================================================

@app.get("/audit/latest")

def get_latest_audit_logs(limit: int = 50, creds: dict = Depends(get_current_credentials)):

    if not os.path.exists(AuditLogger.DB_FILE):

        return {"data": []}

        

    try:

        conn = sqlite3.connect(AuditLogger.DB_FILE)

        conn.row_factory = sqlite3.Row # Permite ler as colunas pelo nome

        c = conn.cursor()

        

        # Busca os últimos registros ordenados do mais recente para o mais antigo

        c.execute("SELECT data_hora, operador, acao, alvo, status FROM audit_logs ORDER BY id DESC LIMIT ?", (limit,))

        rows = c.fetchall()

        conn.close()

        

        # Converte as linhas do banco para uma lista de dicionários (JSON)

        return {"data": [dict(ix) for ix in rows]}

        

    except Exception as e:

        raise HTTPException(status_code=500, detail=str(e))



# ==========================================================

# 2. CARDS DE RESUMO DA TELA INICIAL (OPÇÃO 4)

# ==========================================================

@app.get("/dashboard/summary")

def get_dashboard_summary(creds: dict = Depends(get_current_credentials)):

    conn = get_ldap_connection(creds)

    try:

        # Busca quantidade de contas atualmente bloqueadas no AD

        conn.search(creds['search_base'], '(&(objectClass=user)(lockoutTime>=1))', attributes=['sAMAccountName'])

        locked_count = len(conn.entries)

        

        # Busca quantidade de contas com troca obrigatória pendente (pwdLastSet=0)

        conn.search(creds['search_base'], '(&(objectClass=user)(pwdLastSet=0))', attributes=['sAMAccountName'])

        pending_pwd_count = len(conn.entries)

        

        return {

            "locked_users": locked_count,

            "pending_passwords": pending_pwd_count,

            "status": "Online"

        }

    except Exception as e:

        return {"locked_users": 0, "pending_passwords": 0, "status": "Offline"}

    finally:

        conn.unbind()



# ==========================================================

# 3. GESTÃO DE GRUPOS - ADICIONAR E REMOVER (OPÇÃO 2)

# ==========================================================



# ==========================================================

# DESEMPENHO DO MOTOR DE BUSCA

# ==========================================================





@app.get("/dashboard/search-cache")

def get_search_cache_dashboard(

    creds: dict = Depends(

        get_current_credentials

    )

):

    return get_search_cache_status()





@app.get("/dashboard/search-performance")

def get_search_performance(

    limit: int = 2000,

    slow_limit: int = 20,

    creds: dict = Depends(

        get_current_credentials

    )

):

    limit = max(

        1,

        min(

            int(limit),

            5000

        )

    )



    slow_limit = max(

        1,

        min(

            int(slow_limit),

            100

        )

    )



    log_files = []



    for backup_number in range(

        SEARCH_LOG_BACKUP_COUNT,

        0,

        -1

    ):

        backup_file = (

            SEARCH_LOG_FILE

            + f".{backup_number}"

        )



        if os.path.isfile(backup_file):

            log_files.append(backup_file)



    if os.path.isfile(SEARCH_LOG_FILE):

        log_files.append(SEARCH_LOG_FILE)



    registros = []

    linhas_lidas = 0

    linhas_invalidas = 0



    for log_file in log_files:

        try:

            with open(

                log_file,

                "r",

                encoding="utf-8"

            ) as handle:

                for line in handle:

                    texto = line.strip()



                    if not texto:

                        continue



                    linhas_lidas += 1



                    try:

                        item = json.loads(texto)



                        if not isinstance(item, dict):

                            raise ValueError(

                                "Registro nao e objeto JSON."

                            )



                        registro = {

                            "timestamp": item.get(

                                "timestamp"

                            ),

                            "term_type": str(

                                item.get("term_type")

                                or "unknown"

                            ),

                            "term_length": int(

                                item.get("term_length")

                                or 0

                            ),

                            "auxiliary_source": str(

                                item.get(

                                    "auxiliary_source"

                                )

                                or "none"

                            ),

                            "ldap_mode": str(

                                item.get("ldap_mode")

                                or "unknown"

                            ),

                            "result_count": int(

                                item.get("result_count")

                                or 0

                            ),

                            "xupervisor_ms": float(

                                item.get(

                                    "xupervisor_ms"

                                )

                                or 0

                            ),

                            "vetorh_ms": float(

                                item.get("vetorh_ms")

                                or 0

                            ),

                            "ldap_connect_ms": float(

                                item.get(

                                    "ldap_connect_ms"

                                )

                                or 0

                            ),

                            "ldap_search_ms": float(

                                item.get(

                                    "ldap_search_ms"

                                )

                                or 0

                            ),

                            "formatting_ms": float(

                                item.get(

                                    "formatting_ms"

                                )

                                or 0

                            ),

                            "total_ms": float(

                                item.get("total_ms")

                                or 0

                            )

                        }



                    except Exception:

                        linhas_invalidas += 1

                        continue



                    registros.append(registro)



                    if len(registros) > limit:

                        registros.pop(0)



        except Exception:

            continue



    total = len(registros)



    thresholds = {

        "slow": 3000,

        "critical": 10000

    }



    if total == 0:

        return {

            "status": "empty",

            "generated_at": datetime.now().isoformat(

                timespec="seconds"

            ),

            "message": (

                "Nenhuma medicao valida encontrada."

            ),

            "thresholds_ms": thresholds,

            "files_found": len(log_files),

            "lines_read": linhas_lidas,

            "invalid_lines": linhas_invalidas,

            "analyzed_count": 0,

            "summary": {

                "fast_count": 0,

                "slow_count": 0,

                "critical_count": 0,

                "fast_percentage": 0,

                "slow_percentage": 0,

                "critical_percentage": 0

            },

            "averages_ms": {},

            "maximums_ms": {},

            "ldap_modes": {},

            "term_types": {},

            "auxiliary_sources": {},

            "slowest_searches": []

        }



    def average(field_name):

        return round(

            sum(

                float(

                    item.get(field_name, 0)

                    or 0

                )

                for item in registros

            )

            / total,

            2

        )



    def maximum(field_name):

        return round(

            max(

                float(

                    item.get(field_name, 0)

                    or 0

                )

                for item in registros

            ),

            2

        )



    def distribution(field_name):

        output = {}



        for item in registros:

            key = str(

                item.get(field_name)

                or "unknown"

            )



            output[key] = (

                output.get(key, 0)

                + 1

            )



        return dict(

            sorted(

                output.items(),

                key=lambda pair: (

                    -pair[1],

                    pair[0]

                )

            )

        )



    fast_count = sum(

        1

        for item in registros

        if item["total_ms"] < 3000

    )



    slow_count = sum(

        1

        for item in registros

        if (

            item["total_ms"] >= 3000

            and item["total_ms"] < 10000

        )

    )



    critical_count = sum(

        1

        for item in registros

        if item["total_ms"] >= 10000

    )



    slowest = sorted(

        registros,

        key=lambda item: item["total_ms"],

        reverse=True

    )[:slow_limit]



    slowest_safe = []



    for item in slowest:

        if item["total_ms"] >= 10000:

            classification = "critical"

        elif item["total_ms"] >= 3000:

            classification = "slow"

        else:

            classification = "fast"



        slowest_safe.append(

            {

                "timestamp": item["timestamp"],

                "term_type": item["term_type"],

                "term_length": item["term_length"],

                "auxiliary_source": item[

                    "auxiliary_source"

                ],

                "ldap_mode": item["ldap_mode"],

                "result_count": item[

                    "result_count"

                ],

                "ldap_connect_ms": round(

                    item["ldap_connect_ms"],

                    2

                ),

                "ldap_search_ms": round(

                    item["ldap_search_ms"],

                    2

                ),

                "total_ms": round(

                    item["total_ms"],

                    2

                ),

                "classification": classification

            }

        )



    return {

        "status": "ok",

        "generated_at": datetime.now().isoformat(

            timespec="seconds"

        ),

        "thresholds_ms": thresholds,

        "files_found": len(log_files),

        "lines_read": linhas_lidas,

        "invalid_lines": linhas_invalidas,

        "analyzed_count": total,

        "configured_limit": limit,

        "summary": {

            "fast_count": fast_count,

            "slow_count": slow_count,

            "critical_count": critical_count,

            "fast_percentage": round(

                fast_count / total * 100,

                2

            ),

            "slow_percentage": round(

                slow_count / total * 100,

                2

            ),

            "critical_percentage": round(

                critical_count / total * 100,

                2

            )

        },

        "averages_ms": {

            "xupervisor": average(

                "xupervisor_ms"

            ),

            "vetorh": average(

                "vetorh_ms"

            ),

            "ldap_connect": average(

                "ldap_connect_ms"

            ),

            "ldap_search": average(

                "ldap_search_ms"

            ),

            "formatting": average(

                "formatting_ms"

            ),

            "total": average(

                "total_ms"

            )

        },

        "maximums_ms": {

            "xupervisor": maximum(

                "xupervisor_ms"

            ),

            "vetorh": maximum(

                "vetorh_ms"

            ),

            "ldap_connect": maximum(

                "ldap_connect_ms"

            ),

            "ldap_search": maximum(

                "ldap_search_ms"

            ),

            "formatting": maximum(

                "formatting_ms"

            ),

            "total": maximum(

                "total_ms"

            )

        },

        "ldap_modes": distribution(

            "ldap_mode"

        ),

        "term_types": distribution(

            "term_type"

        ),

        "auxiliary_sources": distribution(

            "auxiliary_source"

        ),

        "slowest_searches": slowest_safe

    }





class GroupActionPayload(BaseModel):

    group_name: str



@app.post("/users/{username}/groups/add")

def add_user_to_group(username: str, payload: GroupActionPayload, creds: dict = Depends(get_current_credentials)):

    conn = get_ldap_connection(creds)

    try:

        # Busca DN do Usuário

        conn.search(creds['search_base'], f"(sAMAccountName={username})")

        if not conn.entries:

            raise HTTPException(status_code=404, detail="Usuário não encontrado.")

        user_dn = conn.entries[0].entry_dn

        

        # Busca DN do Grupo

        conn.search(creds['search_base'], f"(&(objectClass=group)(sAMAccountName={payload.group_name}))")

        if not conn.entries:

            raise HTTPException(status_code=404, detail="Grupo não encontrado no AD.")

        group_dn = conn.entries[0].entry_dn

        

        # Adiciona membro no AD via LDAP MODIFY_ADD

        success = conn.modify(group_dn, {'member': [(ldap3.MODIFY_ADD, [user_dn])]})

        if not success:

            raise HTTPException(status_code=400, detail=f"Erro no AD: {conn.result['description']}")

            

        AuditLogger.log(creds["username"], "AddGroup", username, f"Grupo: {payload.group_name}")

        invalidate_search_cache()

        return {"message": f"Usuário adicionado ao grupo {payload.group_name} com sucesso."}

    finally:

        conn.unbind()



@app.post("/users/{username}/groups/remove")

def remove_user_from_group(username: str, payload: GroupActionPayload, creds: dict = Depends(get_current_credentials)):

    conn = get_ldap_connection(creds)

    try:

        conn.search(creds['search_base'], f"(sAMAccountName={username})")

        if not conn.entries:

            raise HTTPException(status_code=404, detail="Usuário não encontrado.")

        user_dn = conn.entries[0].entry_dn

        

        conn.search(creds['search_base'], f"(&(objectClass=group)(sAMAccountName={payload.group_name}))")

        if not conn.entries:

            raise HTTPException(status_code=404, detail="Grupo não encontrado no AD.")

        group_dn = conn.entries[0].entry_dn

        

        success = conn.modify(group_dn, {'member': [(ldap3.MODIFY_DELETE, [user_dn])]})

        if not success:

            raise HTTPException(status_code=400, detail=f"Erro no AD: {conn.result['description']}")

            

        AuditLogger.log(creds["username"], "RemoveGroup", username, f"Grupo: {payload.group_name}")

        invalidate_search_cache()

        return {"message": f"Usuário removido do grupo {payload.group_name} com sucesso."}

    finally:

        conn.unbind()



# ==========================================================

# MÓDULO 11: NOTIFICAR USUÁRIO ATIVO NO DESKTOP (WINRM)

# ==========================================================

class NotifyPayload(BaseModel):

    message: str



@app.post("/computers/{hostname}/notify")

def notify_active_user(hostname: str, payload: NotifyPayload, creds: dict = Depends(get_current_credentials)):

    if not payload.message or not payload.message.strip():

        raise HTTPException(status_code=400, detail="A mensagem não pode estar vazia.")

        

    network_target = hostname.rstrip('$').lower()

    if "." not in network_target:

        network_target = f"{network_target}.{creds['domain']}"

        

    # Sanitiza aspas para não quebrar o comando PowerShell

    msg_clean = payload.message.replace('"', "'").strip()

    

    # Executa o comando nativo do Windows 'msg *' na sessão remota via WinRM

    script_block = f"msg * \"[KAD Mobile - Suporte TI] {msg_clean}\""

    script = (

        f"$so = New-PSSessionOption -OpenTimeout 10000 -OperationTimeout 20000; "

        f"Invoke-Command -ComputerName '{network_target}' -SessionOption $so -ScriptBlock {{ {script_block} }} -Credential $mycreds"

    )

    

    run_powershell(script, creds, return_json=False)

    AuditLogger.log(creds["username"], "NotificarUsuario", network_target, f"Mensagem: {msg_clean[:30]}...")

    return {"message": f"Alerta enviado com sucesso para a tela de {hostname.rstrip('$')}!"}



# --- APIS DO MOVIMEX ---

import os

import glob

import traceback

import re

import socket

import pandas as pd

from fastapi.responses import FileResponse

from fastapi import Query, HTTPException



# 1. DECLARAÇÃO DE PASTAS DO SERVIDOR

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

DATABASE_DIR = os.path.join(BASE_DIR, "database")

APK_DIR = os.path.join(BASE_DIR, "apk")



if not os.path.exists(DATABASE_DIR): os.makedirs(DATABASE_DIR)

if not os.path.exists(APK_DIR): os.makedirs(APK_DIR)



# ==========================================================

# MOTOR DE CACHE SQLITE DO MOVIMEX (DELTA SYNC)

# ==========================================================

import hashlib

import time

import json

import sqlite3

import threading



MOVIMEX_DB_FILE = os.path.join(DATABASE_DIR, "movimex_cache.db")

movimex_sync_lock = threading.Lock()



def calcular_hash_arquivo(caminho):

    hash_md5 = hashlib.md5()

    try:

        with open(caminho, "rb") as f:

            for chunk in iter(lambda: f.read(4096), b""):

                hash_md5.update(chunk)

        return hash_md5.hexdigest()

    except Exception:

        return ""



def init_movimex_db():

    conn = sqlite3.connect(MOVIMEX_DB_FILE)

    c = conn.cursor()

    c.execute('''CREATE TABLE IF NOT EXISTS file_hashes (tipo TEXT PRIMARY KEY, hash TEXT)''')

    

    # MUDANÇA: A chave agora é id_unico e não apenas o codigo!

    c.execute('CREATE TABLE IF NOT EXISTS itens (id_unico TEXT PRIMARY KEY, payload TEXT, data_atualizacao INTEGER, excluido INTEGER DEFAULT 0)')

    c.execute('CREATE TABLE IF NOT EXISTS itens_f41 (id_unico TEXT PRIMARY KEY, payload TEXT, data_atualizacao INTEGER, excluido INTEGER DEFAULT 0)')

    c.execute('CREATE TABLE IF NOT EXISTS impressoras (id TEXT PRIMARY KEY, payload TEXT, data_atualizacao INTEGER, excluido INTEGER DEFAULT 0)')

    conn.commit()

    conn.close()



def atualizar_cache_se_necessario():

    """

    Verifica alterações nos arquivos Excel e atualiza o cache SQLite

    utilizado pelo Delta Sync do MoviMeX.

    """



    # Impede dois dispositivos de processarem os mesmos arquivos

    # simultaneamente.

    with movimex_sync_lock:

        init_movimex_db()



        conn = sqlite3.connect(

            MOVIMEX_DB_FILE,

            timeout=30

        )



        try:

            c = conn.cursor()



            # ======================================================

            # LOCALIZAÇÃO DOS ARQUIVOS

            # ======================================================



            arquivos_kbm = (

                glob.glob(

                    os.path.join(

                        DATABASE_DIR,

                        "KBM*.xlsx"

                    )

                )

                + glob.glob(

                    os.path.join(

                        BASE_DIR,

                        "KBM*.xlsx"

                    )

                )

            )



            arquivos_f41 = (

                glob.glob(

                    os.path.join(

                        DATABASE_DIR,

                        "F41*.xlsx"

                    )

                )

                + glob.glob(

                    os.path.join(

                        BASE_DIR,

                        "F41*.xlsx"

                    )

                )

            )



            arquivos_prt = (

                glob.glob(

                    os.path.join(

                        DATABASE_DIR,

                        "printer*.xlsx"

                    )

                )

                + glob.glob(

                    os.path.join(

                        BASE_DIR,

                        "printer*.xlsx"

                    )

                )

            )



            # ======================================================

            # SELECIONA APENAS O ARQUIVO MAIS RECENTE DE CADA TIPO

            # ======================================================



            if arquivos_kbm:

                arquivos_kbm.sort(

                    key=os.path.getmtime,

                    reverse=True

                )

                arquivos_kbm = [arquivos_kbm[0]]



            if arquivos_f41:

                arquivos_f41.sort(

                    key=os.path.getmtime,

                    reverse=True

                )

                arquivos_f41 = [arquivos_f41[0]]



            if arquivos_prt:

                arquivos_prt.sort(

                    key=os.path.getmtime,

                    reverse=True

                )

                arquivos_prt = [arquivos_prt[0]]



            timestamp_agora = int(time.time() * 1000)

            modificado = False



            # ======================================================

            # PROCESSAR KBM

            # ======================================================



            for caminho in arquivos_kbm:

                hash_atual = calcular_hash_arquivo(caminho)

                nome_arquivo = os.path.basename(caminho)



                c.execute(

                    """

                    SELECT hash

                    FROM file_hashes

                    WHERE tipo = ?

                    """,

                    (nome_arquivo,)

                )



                row_hash = c.fetchone()



                # Processa somente quando o arquivo é novo ou mudou.

                if not row_hash or row_hash[0] != hash_atual:

                    print(

                        f"[DELTA SYNC] Processando "

                        f"{nome_arquivo}..."

                    )



                    try:

                        df = pd.read_excel(

                            caminho,

                            dtype=str

                        ).fillna("")



                        df = df.astype(str)



                        # Normaliza os nomes das colunas:

                        # remove quebras, tabs e espaços duplicados.

                        df.columns = [

                            re.sub(

                                r"\s+",

                                " ",

                                str(coluna)

                            ).strip()

                            for coluna in df.columns

                        ]



                        print(

                            f"[KBM] Arquivo selecionado: "

                            f"{caminho}"

                        )



                        print(

                            f"[KBM] Linhas encontradas no Excel: "

                            f"{len(df)}"

                        )



                        print(

                            f"[KBM] Colunas encontradas: "

                            f"{list(df.columns)}"

                        )



                        ids_processados = set()

                        ocorrencias_por_assinatura = {}

                        inseridos = 0

                        ignorados_sem_codigo = 0

                        chaves_duplicadas = 0

                        erros_linha = 0



                        for indice, r in df.iterrows():

                            try:

                                # ----------------------------------

                                # CÓDIGO KINROSS

                                # ----------------------------------



                                if "Codigo Kinross" in df.columns:

                                    codigo = str(

                                        r.get(

                                            "Codigo Kinross",

                                            ""

                                        )

                                    ).strip()

                                elif len(r) > 5:

                                    codigo = str(

                                        r.iloc[5]

                                    ).strip()

                                else:

                                    codigo = ""



                                if codigo.lower() == "nan":

                                    codigo = ""



                                if not codigo:

                                    ignorados_sem_codigo += 1



                                    print(

                                        f"[KBM] Linha "

                                        f"{indice + 2} ignorada: "

                                        f"Codigo Kinross vazio."

                                    )



                                    continue



                                # ----------------------------------

                                # NOTA DE ORIGEM

                                # ----------------------------------



                                if (

                                    "Número do Documento Fiscal"

                                    in df.columns

                                ):

                                    nota_origem = str(

                                        r.get(

                                            "Número do Documento Fiscal",

                                            ""

                                        )

                                    ).strip()

                                elif len(r) > 0:

                                    nota_origem = str(

                                        r.iloc[0]

                                    ).strip()

                                else:

                                    nota_origem = ""



                                if nota_origem.lower() == "nan":

                                    nota_origem = ""



                                # ----------------------------------

                                # PART NUMBER

                                # ----------------------------------



                                if "Part Number" in df.columns:

                                    part_number = str(

                                        r.get(

                                            "Part Number",

                                            ""

                                        )

                                    ).strip()

                                elif len(r) > 4:

                                    part_number = str(

                                        r.iloc[4]

                                    ).strip()

                                else:

                                    part_number = ""



                                if part_number.lower() == "nan":

                                    part_number = ""



                                # ----------------------------------

                                # DESCRIÇÃO

                                # ----------------------------------



                                if "Description" in df.columns:

                                    descricao = str(

                                        r.get(

                                            "Description",

                                            ""

                                        )

                                    ).strip()

                                elif len(r) > 6:

                                    descricao = str(

                                        r.iloc[6]

                                    ).strip()

                                else:

                                    descricao = ""



                                if descricao.lower() == "nan":

                                    descricao = ""



                                # ----------------------------------

                                # ENDEREÇO / VOLUME

                                # ----------------------------------



                                endereco = str(

                                    r.get(

                                        "Description Line 2",

                                        "N/A"

                                    )

                                ).strip()



                                if (

                                    not endereco

                                    or endereco.lower() == "nan"

                                ):

                                    endereco = "N/A"



                                # ----------------------------------

                                # QUANTIDADE

                                # ----------------------------------



                                qtd_nome = next(

                                    (

                                        coluna

                                        for coluna in df.columns

                                        if (

                                            "Quantidade Comercial"

                                            in coluna

                                        )

                                    ),

                                    None

                                )



                                try:

                                    valor_quantidade = (

                                        str(

                                            r.get(

                                                qtd_nome,

                                                ""

                                            )

                                        ).strip()

                                        if qtd_nome

                                        else ""

                                    )



                                    if (

                                        valor_quantidade

                                        and valor_quantidade.lower()

                                        != "nan"

                                    ):

                                        valor_quantidade = (

                                            valor_quantidade.replace(

                                                ",",

                                                "."

                                            )

                                        )



                                        qtd = int(

                                            float(

                                                valor_quantidade

                                            )

                                        )

                                    else:

                                        qtd = 1



                                except (

                                    ValueError,

                                    TypeError

                                ):

                                    qtd = 1



                                # ----------------------------------

                                # ÚLTIMA NOTA

                                # ----------------------------------



                                ultima_nota = str(

                                    r.get(

                                        "Ultima Nota",

                                        "N/A"

                                    )

                                ).strip()



                                if (

                                    not ultima_nota

                                    or ultima_nota.lower() == "nan"

                                ):

                                    ultima_nota = "N/A"



                                # ----------------------------------

                                # FÓRMULA ZPL

                                # ----------------------------------



                                zpl = str(

                                    r.get(

                                        "Formula",

                                        ""

                                    )

                                ).strip()



                                if zpl.lower() == "nan":

                                    zpl = ""



                                # ----------------------------------

                                # CHAVE DETERMINÍSTICA ROBUSTA

                                # ----------------------------------



                                # Cria uma assinatura usando os campos

                                # relevantes da linha do arquivo KBM.

                                dados_assinatura = {

                                    "codigo": codigo,

                                    "nota_origem": nota_origem,

                                    "part_number": part_number,

                                    "descricao": descricao,

                                    "endereco": endereco,

                                    "quantidade": qtd,

                                    "formula": zpl

                                }



                                # Gera uma representação padronizada

                                # dos dados, independentemente da ordem

                                # das chaves do dicionário.

                                assinatura_json = json.dumps(

                                    dados_assinatura,

                                    ensure_ascii=False,

                                    sort_keys=True,

                                    separators=(",", ":")

                                )



                                # Gera um hash determinístico de 20

                                # caracteres para representar a linha.

                                assinatura_hash = hashlib.sha256(

                                    assinatura_json.encode("utf-8")

                                ).hexdigest()[:20]



                                # Conta quantas vezes uma linha com a mesma

                                # assinatura apareceu dentro do Excel.

                                ocorrencia = (

                                    ocorrencias_por_assinatura.get(

                                        assinatura_hash,

                                        0

                                    )

                                    + 1

                                )



                                ocorrencias_por_assinatura[

                                    assinatura_hash

                                ] = ocorrencia



                                # Combina código, nota, assinatura e ocorrência.

                                # Assim, todas as linhas recebem IDs únicos,

                                # inclusive linhas completamente repetidas.

                                id_unico = (

                                    f"{codigo}_"

                                    f"{nota_origem}_"

                                    f"{assinatura_hash}_"

                                    f"{ocorrencia}"

                                )



                                # Registra quando duas linhas possuem

                                # exatamente o mesmo conteúdo relevante.

                                if ocorrencia > 1:

                                    chaves_duplicadas += 1



                                    print(

                                        f"[KBM] Linha completamente "

                                        f"repetida na posição "

                                        f"{indice + 2}: "

                                        f"{codigo}_{nota_origem}, "

                                        f"ocorrência {ocorrencia}"

                                    )



                                ids_processados.add(id_unico)



                                # ----------------------------------

                                # PAYLOAD PARA O APLICATIVO

                                # ----------------------------------



                                item_dict = {

                                    "id_unico": id_unico,

                                    "codigo": codigo,

                                    "part_number": part_number,

                                    "descricao": descricao,

                                    "qtdOriginal": qtd,

                                    "volume": endereco,

                                    "zpl": zpl,

                                    "nota_origem": nota_origem,

                                    "ultima_nota": ultima_nota,

                                    "busca_global": (

                                        f"{nota_origem} "

                                        f"{part_number} "

                                        f"{codigo} "

                                        f"{ultima_nota}"

                                    ).upper()

                                }



                                # Atualiza registros existentes ou

                                # insere registros novos.

                                c.execute(

                                    """

                                    REPLACE INTO itens (

                                        id_unico,

                                        payload,

                                        data_atualizacao,

                                        excluido

                                    )

                                    VALUES (?, ?, ?, 0)

                                    """,

                                    (

                                        id_unico,

                                        json.dumps(

                                            item_dict,

                                            ensure_ascii=False

                                        ),

                                        timestamp_agora

                                    )

                                )



                                inseridos += 1



                            except Exception as erro_linha:

                                erros_linha += 1



                                print(

                                    f"[ERRO KBM] Linha "

                                    f"{indice + 2}: "

                                    f"{erro_linha}"

                                )



                        # Salva o hash somente depois que o arquivo

                        # foi processado.

                        c.execute(

                            """

                            REPLACE INTO file_hashes (

                                tipo,

                                hash

                            )

                            VALUES (?, ?)

                            """,

                            (

                                nome_arquivo,

                                hash_atual

                            )

                        )



                        modificado = True



                        print(

                            "[KBM] Processamento concluído: "

                            f"Excel={len(df)}, "

                            f"Processados={inseridos}, "

                            f"Sem código={ignorados_sem_codigo}, "

                            f"Erros={erros_linha}, "

                            f"Duplicidades={chaves_duplicadas}, "

                            f"IDs únicos={len(ids_processados)}"

                        )



                    except Exception as erro_kbm:

                        print(

                            f"[ERRO KBM] Falha ao processar "

                            f"{nome_arquivo}: "

                            f"{erro_kbm}"

                        )



                        traceback.print_exc()



                        # Impede que alterações parciais do KBM

                        # permaneçam pendentes na transação.

                        conn.rollback()



                        raise



            # ======================================================

            # PROCESSAR F41

            # ======================================================



            for caminho in arquivos_f41:

                hash_atual = calcular_hash_arquivo(caminho)

                nome_arquivo = os.path.basename(caminho)



                c.execute(

                    """

                    SELECT hash

                    FROM file_hashes

                    WHERE tipo = ?

                    """,

                    (nome_arquivo,)

                )



                row_hash = c.fetchone()



                if not row_hash or row_hash[0] != hash_atual:

                    print(

                        f"[DELTA SYNC] Processando "

                        f"{nome_arquivo}..."

                    )



                    try:

                        df = pd.read_excel(

                            caminho,

                            dtype=str

                        ).fillna("")



                        df = df.astype(str)



                        df.columns = [

                            re.sub(

                                r"\s+",

                                " ",

                                str(coluna)

                            ).strip()

                            for coluna in df.columns

                        ]



                        f41_processados = 0

                        f41_ignorados = 0

                        f41_erros = 0



                        for indice, r in df.iterrows():

                            try:

                                codigo = str(

                                    r.get(

                                        "Short Item No",

                                        ""

                                    )

                                ).strip()



                                if codigo.lower() == "nan":

                                    codigo = ""



                                if not codigo:

                                    f41_ignorados += 1

                                    continue



                                descricao = str(

                                    r.get(

                                        "Description",

                                        ""

                                    )

                                ).strip()



                                linha2 = str(

                                    r.get(

                                        "Description Line 2",

                                        ""

                                    )

                                ).strip()



                                tipo = str(

                                    r.get(

                                        "Tipo",

                                        ""

                                    )

                                ).strip()



                                qtd = str(

                                    r.get(

                                        "Quantity On Hand",

                                        "0"

                                    )

                                ).strip()



                                location = str(

                                    r.get(

                                        "Location",

                                        ""

                                    )

                                ).strip()



                                ultima_nota = str(

                                    r.get(

                                        "Ultima Nota",

                                        "N/A"

                                    )

                                ).strip()



                                if location.lower() == "nan":

                                    location = ""



                                if (

                                    not descricao

                                    or descricao.lower() == "nan"

                                ):

                                    descricao = "Sem Descrição"



                                if linha2.lower() == "nan":

                                    linha2 = ""



                                if tipo.lower() == "nan":

                                    tipo = ""



                                if qtd.lower() == "nan":

                                    qtd = "0"



                                if (

                                    not ultima_nota

                                    or ultima_nota.lower() == "nan"

                                ):

                                    ultima_nota = "N/A"



                                zpl_f41 = (

                                    "CT~~CD,~CC^~CT~"

                                    "^XA"

                                    "~TA000"

                                    "~JSN"

                                    "^LT0"

                                    "^MNW"

                                    "^MTT"

                                    "^PON"

                                    "^PMN"

                                    "^LH0,0"

                                    "^JMA"

                                    "^PR4,4"

                                    "~SD15"

                                    "^JUS"

                                    "^LRN"

                                    "^CI0"

                                    "^XZ"

                                    "^XA"

                                    "^MMT"

                                    "^PW559"

                                    "^LL0400"

                                    "^LS0"

                                    "^BY4,3,174"

                                    "^FT72,198"

                                    "^BCN,,Y,N"

                                    f"^FD{codigo}"

                                    "^FS"

                                    "^FT35,300"

                                    "^A0N,45,31"

                                    "^FH\\"

                                    f"^FDDesc:{descricao[:30]}"

                                    "^FS"

                                    "^FT35,350"

                                    "^A0N,45,31"

                                    "^FH\\"

                                    f"^FDDesc2:{linha2[:30]}"

                                    "^FS"

                                    "^PQ1,0,1,Y"

                                    "^XZ"

                                )



                                id_unico = (

                                    f"{codigo}_{location}"

                                )



                                item_dict = {

                                    "id_unico": id_unico,

                                    "codigo": codigo,

                                    "descricao": descricao,

                                    "linha2": linha2,

                                    "tipo": tipo,

                                    "qtd_estoque": qtd,

                                    "location": location,

                                    "ultima_nota": ultima_nota,

                                    "zpl": zpl_f41,

                                    "busca_global": (

                                        f"{codigo} "

                                        f"{descricao} "

                                        f"{location} "

                                        f"{ultima_nota}"

                                    ).upper()

                                }



                                c.execute(

                                    """

                                    REPLACE INTO itens_f41 (

                                        id_unico,

                                        payload,

                                        data_atualizacao,

                                        excluido

                                    )

                                    VALUES (?, ?, ?, 0)

                                    """,

                                    (

                                        id_unico,

                                        json.dumps(

                                            item_dict,

                                            ensure_ascii=False

                                        ),

                                        timestamp_agora

                                    )

                                )



                                f41_processados += 1



                            except Exception as erro_linha:

                                f41_erros += 1



                                print(

                                    f"[ERRO F41] Linha "

                                    f"{indice + 2}: "

                                    f"{erro_linha}"

                                )



                        c.execute(

                            """

                            REPLACE INTO file_hashes (

                                tipo,

                                hash

                            )

                            VALUES (?, ?)

                            """,

                            (

                                nome_arquivo,

                                hash_atual

                            )

                        )



                        modificado = True



                        print(

                            "[F41] Processamento concluído: "

                            f"Excel={len(df)}, "

                            f"Processados={f41_processados}, "

                            f"Ignorados={f41_ignorados}, "

                            f"Erros={f41_erros}"

                        )



                    except Exception as erro_f41:

                        print(

                            f"[ERRO F41] Falha ao processar "

                            f"{nome_arquivo}: "

                            f"{erro_f41}"

                        )



                        traceback.print_exc()

                        conn.rollback()

                        raise



            # ======================================================

            # PROCESSAR IMPRESSORAS

            # ======================================================



            for caminho in arquivos_prt:

                hash_atual = calcular_hash_arquivo(caminho)

                nome_arquivo = os.path.basename(caminho)



                c.execute(

                    """

                    SELECT hash

                    FROM file_hashes

                    WHERE tipo = ?

                    """,

                    (nome_arquivo,)

                )



                row_hash = c.fetchone()



                if not row_hash or row_hash[0] != hash_atual:

                    print(

                        f"[DELTA SYNC] Processando "

                        f"{nome_arquivo}..."

                    )



                    try:

                        df = pd.read_excel(

                            caminho,

                            dtype=str

                        ).fillna("")



                        df = df.astype(str)



                        df.columns = [

                            re.sub(

                                r"\s+",

                                " ",

                                str(coluna)

                            ).strip()

                            for coluna in df.columns

                        ]



                        impressoras_processadas = 0

                        impressoras_ignoradas = 0

                        impressoras_erros = 0



                        for indice, r in df.iterrows():

                            try:

                                mac = str(

                                    r.get(

                                        "MAC",

                                        ""

                                    )

                                ).strip()



                                ip = str(

                                    r.get(

                                        "IP",

                                        ""

                                    )

                                ).strip()



                                nome = str(

                                    r.get(

                                        "Nome",

                                        ""

                                    )

                                ).strip()



                                if nome.lower() == "nan":

                                    nome = ""



                                if not nome:

                                    impressoras_ignoradas += 1

                                    continue



                                if mac.lower() == "nan":

                                    mac = ""



                                if ip.lower() == "nan":

                                    ip = ""



                                id_impressora = nome.upper()



                                item_dict = {

                                    "id": id_impressora,

                                    "nome": nome,

                                    "ip": ip,

                                    "mac": mac,

                                    "busca_global": (

                                        f"{nome} "

                                        f"{ip} "

                                        f"{mac}"

                                    ).upper()

                                }



                                c.execute(

                                    """

                                    REPLACE INTO impressoras (

                                        id,

                                        payload,

                                        data_atualizacao,

                                        excluido

                                    )

                                    VALUES (?, ?, ?, 0)

                                    """,

                                    (

                                        id_impressora,

                                        json.dumps(

                                            item_dict,

                                            ensure_ascii=False

                                        ),

                                        timestamp_agora

                                    )

                                )



                                impressoras_processadas += 1



                            except Exception as erro_linha:

                                impressoras_erros += 1



                                print(

                                    f"[ERRO IMPRESSORA] Linha "

                                    f"{indice + 2}: "

                                    f"{erro_linha}"

                                )



                        c.execute(

                            """

                            REPLACE INTO file_hashes (

                                tipo,

                                hash

                            )

                            VALUES (?, ?)

                            """,

                            (

                                nome_arquivo,

                                hash_atual

                            )

                        )



                        modificado = True



                        print(

                            "[IMPRESSORAS] Processamento concluído: "

                            f"Excel={len(df)}, "

                            f"Processadas="

                            f"{impressoras_processadas}, "

                            f"Ignoradas="

                            f"{impressoras_ignoradas}, "

                            f"Erros={impressoras_erros}"

                        )



                    except Exception as erro_impressoras:

                        print(

                            f"[ERRO IMPRESSORAS] Falha ao "

                            f"processar {nome_arquivo}: "

                            f"{erro_impressoras}"

                        )



                        traceback.print_exc()

                        conn.rollback()

                        raise



            # ======================================================

            # FINALIZAÇÃO DA TRANSAÇÃO

            # ======================================================



            if modificado:

                conn.commit()



                print(

                    "[DELTA SYNC] Alterações gravadas "

                    "com sucesso no SQLite."

                )



        except Exception as erro_geral:

            conn.rollback()



            print(

                f"[DELTA SYNC] Erro geral durante a "

                f"atualização do cache: {erro_geral}"

            )



            traceback.print_exc()

            raise



        finally:

            conn.close()



@app.get("/api/sync")

def sync_delta(last_sync: int = Query(0, description="Timestamp do celular")):

    try:

        # 1. Verifica se houve alteração nos arquivos físicos (Excel)

        atualizar_cache_se_necessario()



        # 2. Conecta ao banco de dados SQLite

        conn = sqlite3.connect(MOVIMEX_DB_FILE, timeout=30)

        c = conn.cursor()

        

        def buscar_delta(tabela, ts_sync):

            try:

                # O PULO DO GATO: A cláusula WHERE garante que apenas as linhas 

                # criadas, modificadas ou excluídas APÓS a última sincronização do aparelho

                # sejam retornadas na pesquisa.

                c.execute(f"SELECT payload, excluido FROM {tabela} WHERE data_atualizacao > ?", (ts_sync,))

                

                resultados = []

                for row in c.fetchall():

                    item = json.loads(row[0])

                    item['excluido'] = row[1]

                    resultados.append(item)

                return resultados

            except sqlite3.OperationalError:

                return [] 



        # 3. Busca apenas as "novidades" (O Delta Real)

        itens = buscar_delta("itens", last_sync)

        itens_f41 = buscar_delta("itens_f41", last_sync)

        impressoras = buscar_delta("impressoras", last_sync)

        conn.close()



        # 4. Crava o carimbo de tempo EXATO do servidor para o celular anotar.

        # Usa-se o relógio do servidor (e não do aparelho) para evitar furos no fuso horário.

        timestamp_atual = int(time.time() * 1000)

        

        return {

            "timestamp_servidor": timestamp_atual,

            "itens": itens,

            "itens_f41": itens_f41,

            "impressoras": impressoras

        }

    except Exception as e:

        print(traceback.format_exc())

        raise HTTPException(status_code=500, detail=f"ERRO DE SYNC: {str(e)}")



# ==========================================================

# ROTAS DE IMPRESSÃO E UPDATE

# ==========================================================

class ImprimirRequest(BaseModel):

    impressora_ip: str 

    codigo_item: str

    nota: str

    quantidade: int

    zpl_formula: str

    tipo: str



@app.post("/api/imprimir")

def imprimir_etiqueta_movimex(req: ImprimirRequest):

    zpl_original = req.zpl_formula.replace('¨', '') 

    qtd_print = req.quantidade if req.tipo == 'individual' else 1

    zpl_pronto = re.sub(r'\^PQ\d+', f'^PQ{qtd_print}', zpl_original) if re.search(r'\^PQ\d+', zpl_original) else zpl_original.replace('^XZ', f'^PQ{qtd_print}^XZ')

    

    try:

        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:

            s.settimeout(3)

            s.connect((req.impressora_ip, 9100))

            s.sendall(zpl_pronto.encode('utf-8'))

        return {"status": "sucesso"}

    except Exception:

        raise HTTPException(status_code=500, detail="Impressora offline.")



@app.get("/api/update/download")

def baixar_apk():

    # MUDANÇA 3: Procura o APK em duas pastas diferentes (Produção e Desenvolvimento)

    caminho_servidor = os.path.join(APK_DIR, "movimex.apk")

    caminho_dev = r"C:\Apps\KAD_Mobile\active_directory_mobile\apk\movimex.apk"

    

    if os.path.exists(caminho_servidor):

        return FileResponse(caminho_servidor, media_type="application/vnd.android.package-archive", filename="MoviMeX_Update.apk")

    elif os.path.exists(caminho_dev):

        return FileResponse(caminho_dev, media_type="application/vnd.android.package-archive", filename="MoviMeX_Update.apk")

        

    raise HTTPException(status_code=404, detail="Coloque o apk na pasta /apk/ do servidor.")



# ==========================================================

# MÓDULO FRONTEND (HOSPEDAGEM DOS DOIS SISTEMAS REACT)

# ==========================================================

from fastapi.staticfiles import StaticFiles

from fastapi.responses import RedirectResponse



MOVIMEX_DIST_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "movimex-dist")

PWA_DIST_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "kad-pwa", "dist")



MAPRIX_DIST_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "maprix-dist")



# ----------------------------------------------------------

# MAPRIX: API montada ANTES das rotas curinga

# ----------------------------------------------------------

if MAPRIX_DISPONIVEL:

    app.mount("/maprix/api", maprix_app, name="maprix_api")



@app.get("/maprix", include_in_schema=False)

async def redirect_maprix():

    return RedirectResponse(url="/maprix/")



@app.get("/maprix/", include_in_schema=False)

async def serve_maprix_raiz():

    index_maprix = os.path.join(MAPRIX_DIST_DIR, "index.html")

    if not os.path.isfile(index_maprix):

        raise HTTPException(status_code=404, detail="Build do Maprix nao encontrado (maprix-dist).")

    return FileResponse(index_maprix)



@app.get("/maprix/{file_path:path}", include_in_schema=False)

async def serve_maprix_files(file_path: str):

    caminho_real = os.path.normpath(os.path.join(MAPRIX_DIST_DIR, file_path))

    if caminho_real.startswith(MAPRIX_DIST_DIR) and os.path.isfile(caminho_real):

        return FileResponse(caminho_real)

    extensoes_assets = ('.js', '.css', '.ico', '.png', '.svg', '.webmanifest', '.map', '.json', '.woff', '.woff2')

    if file_path.lower().endswith(extensoes_assets):

        raise HTTPException(status_code=404, detail="Asset Maprix nao encontrado.")

    return await serve_maprix_raiz()





@app.get("/Movimex", include_in_schema=False)

async def redirect_movimex():

    return RedirectResponse(url="/Movimex/")



@app.get("/Movimex/", include_in_schema=False)

async def serve_movimex_raiz():

    return FileResponse(os.path.join(MOVIMEX_DIST_DIR, "index.html"))



@app.get("/Movimex/{file_path:path}", include_in_schema=False)

async def serve_movimex_files(file_path: str):

    caminho_real = os.path.join(MOVIMEX_DIST_DIR, file_path)

    if os.path.exists(caminho_real) and os.path.isfile(caminho_real):

        headers = {}

        if "sw.js" in file_path.lower() or "workbox" in file_path.lower():

            headers["Cache-Control"] = "no-store, no-cache, must-revalidate"

        return FileResponse(caminho_real, headers=headers)

    

    extensoes_pwa = ('.js', '.css', '.ico', '.png', '.svg', '.webmanifest', '.map', '.json')

    if file_path.lower().endswith(extensoes_pwa):

        raise HTTPException(status_code=404, detail="Asset MoviMeX não encontrado.")

    return FileResponse(os.path.join(MOVIMEX_DIST_DIR, "index.html"))



if os.path.exists(PWA_DIST_DIR):

    assets_dir = os.path.join(PWA_DIST_DIR, "assets")

    if os.path.exists(assets_dir):

        app.mount("/assets", StaticFiles(directory=assets_dir), name="kad_assets")



    @app.get("/{full_path:path}", include_in_schema=False)

    async def serve_pwa(full_path: str):

        if full_path.startswith(("api/", "Movimex/", "maprix/")):

            raise HTTPException(status_code=404, detail="Não encontrado no escopo do KAD.")



        file_path = os.path.join(PWA_DIST_DIR, full_path)

        if full_path and os.path.exists(file_path) and os.path.isfile(file_path):

            return FileResponse(file_path)

        

        if full_path.endswith(('.ico', '.png', '.svg', '.webmanifest', '.js', '.css')):

            raise HTTPException(status_code=404)



        return FileResponse(os.path.join(PWA_DIST_DIR, "index.html"))
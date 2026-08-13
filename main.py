import os
from fastapi import FastAPI, HTTPException, Depends, status, Form
from fastapi.security import OAuth2PasswordBearer
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from jose import JWTError, jwt
from datetime import datetime, timedelta
import subprocess
import json
import pyodbc
import socket
import re
import ssl
import subprocess
import ldap3 
from ldap3 import Server, Connection, ALL, SUBTREE, Tls, RESTARTABLE # <-- Atualize esta linha
from pydantic import BaseModel
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, RedirectResponse

app = FastAPI(title="KAD Mobile API - Módulo Avançado AD com Auditoria")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- CONFIGURAÇÃO DO AUDIT LOGGER ---
class AuditLogger:
    @staticmethod
    def log(operador: str, acao: str, alvo: str, status: str):
        try:
            log_file = "KAD_Audit.log" 
            timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            linha_log = f"[{timestamp}] | Operador: {operador} | Acao: {acao} | Alvo: {alvo} | Status: {status}\n"
            with open(log_file, "a", encoding="utf-8") as f:
                f.write(linha_log)
        except Exception as e:
            print(f"Erro ao gravar log de auditoria: {e}")

# --- CONFIGURAÇÕES DE SEGURANÇA ---
SECRET_KEY = "uma-chave-super-secreta-kinross" 
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

class MoveObject(BaseModel):
    new_ou: str

class BulkAction(BaseModel):
    usernames: list[str]

class Token(BaseModel):
    access_token: str
    token_type: str

class NotifyPayload(BaseModel):
    message: str

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
    
    # --- NOVO: BUSCA MESCLADA (VETORH + AD) ---
    # Tenta descobrir o login de rede no SQL Server caso o termo seja IGA DIGID ou Matrícula
    extra_samaccounts = []
    try:
        conn_db = get_db_connection()
        if conn_db:
            cursor_db = conn_db.cursor()
            if search_term.isdigit():
                # Se for número, tenta achar por IGA DIGID ou Matrícula (numcad)
                cursor_db.execute("SELECT usu_networkid FROM vetorh.r034cpl WHERE usu_igadigid = ? OR numcad = ?", (search_term, int(search_term)))
            else:
                # Se for texto, busca só no IGA DIGID
                cursor_db.execute("SELECT usu_networkid FROM vetorh.r034cpl WHERE usu_igadigid = ?", (search_term,))
                
            for row in cursor_db.fetchall():
                if row[0]: 
                    extra_samaccounts.append(str(row[0]).strip())
                    
            cursor_db.close()
            conn_db.close()
    except Exception:
        pass # Ignora falhas de SQL em silêncio para não quebrar a busca normal do AD
    # -------------------------------------------

    conn = get_ldap_connection(creds)
    try:
        # Monta a query LDAP padrão
        ldap_filter = (
            f"(|"
            f"(sAMAccountName=*{search_term}*)"
            f"(displayName=*{search_term}*)"
            f"(mail=*{search_term}*)"
            f"(employeeID=*{search_term}*)"
            f"(pager=*{search_term}*)"
            f"(cn=*{search_term}*)"
        )
        
        # Injeta os logins encontrados no Vetorh dentro da busca do AD!
        for sam in extra_samaccounts:
            ldap_filter += f"(sAMAccountName={sam})"
            
        ldap_filter += ")" # Fecha o bloco (|...)
        
        conn.search(
            creds['search_base'], 
            ldap_filter, 
            search_scope=SUBTREE, 
            attributes=[
                'sAMAccountName', 'displayName', 'mail', 'employeeID', 'pager', 
                'userAccountControl', 'lockoutTime', 'objectClass', 
                'description', 'operatingSystem', 'title', 'department', 
                'telephoneNumber', 'company', 'physicalDeliveryOfficeName', 'distinguishedName',
                'memberOf', 'member', 'dNSHostName', 'managedBy', 'manager', 'lastLogonTimestamp', 
                'whenCreated', 'whenChanged', 'uSNCreated', 'uSNChanged', 'directReports', 'groupType',
                'ESIJDESSOJdeUserName' # <--- NOSSO NOVO CAMPO AQUI
            ]
        )
        
        if not conn.entries:
            raise HTTPException(status_code=404, detail="Objeto não encontrado.")
            
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
                "UserAccountControl": uac,
                "Type": obj_type,
                "MemberOf": sorted(grupos),
                "Members": sorted(membros),
                "Manager": manager_clean,
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

        return {"data": results}
    finally:
        conn.unbind()

# --- AÇÕES DE CONTA E EDIÇÃO DE PERFIL ---

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
        return {"message": "Status alterado com sucesso."}
    finally:
        conn.unbind()

@app.post("/users/{username}/edit-profile")
def edit_profile(username: str, payload: ProfileEdit, creds: dict = Depends(get_current_credentials)):
    conn = get_ldap_connection(creds)
    try:
        conn.search(creds['search_base'], f"(sAMAccountName={username})")
        if not conn.entries:
            raise HTTPException(status_code=404, detail="Objeto não encontrado.")
            
        entry = conn.entries[0]
        changes = {}
        
        if payload.title:
            changes['title'] = [(ldap3.MODIFY_REPLACE, [payload.title])]
        if payload.department:
            changes['department'] = [(ldap3.MODIFY_REPLACE, [payload.department])]
        if payload.telephone:
            changes['telephoneNumber'] = [(ldap3.MODIFY_REPLACE, [payload.telephone])]
            
        if changes:
            success = conn.modify(entry.entry_dn, changes)
            if not success:
                raise HTTPException(status_code=400, detail=f"Erro ao editar perfil: {conn.result['description']}")
                
        AuditLogger.log(creds["username"], "EditarPerfil", username, "SUCESSO")
        return {"message": "Perfil editado com sucesso."}
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
        return {"message": f"Usuário {username} desbloqueado."}
    finally:
        conn.unbind()

@app.post("/users/{username}/reset-password")
def reset_password(username: str, payload: PasswordReset, creds: dict = Depends(get_current_credentials)):
    conn = get_ldap_connection(creds)
    try:
        conn.search(creds['search_base'], f"(sAMAccountName={username})")
        if not conn.entries:
            raise HTTPException(status_code=404, detail="Objeto não encontrado no AD.")
            
        entry = conn.entries[0]
        changes = {}
        
        # 1. Converte e aplica a nova senha em UTF-16-LE (padrão obrigatório da Microsoft)
        pwd_encoded = f'"{payload.new_password}"'.encode('utf-16-le')
        changes['unicodePwd'] = [(ldap3.MODIFY_REPLACE, [pwd_encoded])]
        
        # 2. Desbloqueia a conta junto se a opção estiver marcada
        if payload.unlock_account:
            changes['lockoutTime'] = [(ldap3.MODIFY_REPLACE, [0])]
            
        # 3. Exigir troca no próximo logon:
        # pwdLastSet = 0  -> Exige alteração no próximo logon
        # pwdLastSet = -1 -> Considera a senha atualizada agora (NÃO exige alteração)
        if payload.force_change:
            changes['pwdLastSet'] = [(ldap3.MODIFY_REPLACE, [0])]
        else:
            changes['pwdLastSet'] = [(ldap3.MODIFY_REPLACE, [-1])]
            
        success = conn.modify(entry.entry_dn, changes)
        if not success:
            raise HTTPException(
                status_code=400, 
                detail=f"Falha pelo AD (Política de complexidade ou histórico): {conn.result['description']}"
            )
            
        AuditLogger.log(creds["username"], "ResetSenha", username, f"Desbloqueio: {payload.unlock_account} | ForceChange: {payload.force_change}")
        return {"message": f"Credenciais de {username} atualizadas com sucesso."}
    finally:
        conn.unbind()

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
                else:
                    errors.append({"user": user, "error": conn.result['description']})
            except Exception as e:
                errors.append({"user": user, "error": str(e)})
                
        AuditLogger.log(creds["username"], f"Bulk_{action.capitalize()}", f"{len(payload.usernames)} objetos", f"Sucessos: {success_count}")
        return {"success_count": success_count, "total": len(payload.usernames), "errors": errors}
    finally:
        conn.unbind()

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
            f"Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue | Select-Object LastBootUpTime | Format-List; "
            f"Get-CimInstance Win32_ComputerSystem -ErrorAction SilentlyContinue | Select-Object UserName, TotalPhysicalMemory, Manufacturer, Model | Format-List "
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
# 1. VISOR DE AUDITORIA (CORRIGE O ERRO 404)
# ==========================================================
@app.get("/audit/latest")
def get_latest_audit_logs(limit: int = 25, creds: dict = Depends(get_current_credentials)):
    log_file = "KAD_Audit.log"
    if not os.path.exists(log_file):
        return {"data": ["Nenhum registro de auditoria encontrado até o momento."]}
    try:
        with open(log_file, "r", encoding="utf-8", errors="ignore") as f:
            lines = [line.strip() for line in f.readlines() if line.strip()]
        return {"data": lines[-limit:][::-1]}
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

# Força o caminho real de onde o arquivo main.py está salvo
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATABASE_DIR = os.path.join(BASE_DIR, "database")

if not os.path.exists(DATABASE_DIR):
    os.makedirs(DATABASE_DIR)

IMPRESSORA_PORTA = 9100

class ImprimirRequest(BaseModel):
    impressora_ip: str 
    codigo_item: str
    nota: str
    quantidade: int
    zpl_formula: str
    tipo: str

def carregar_dados_movimex():
    import pandas as pd # Importação segura dentro do escopo
    
    arquivos_kbm = glob.glob(os.path.join(DATABASE_DIR, "KBM*.xlsx"))
    if not arquivos_kbm:
        arquivos_kbm = glob.glob(os.path.join(BASE_DIR, "KBM*.xlsx"))
        if not arquivos_kbm:
            raise Exception(f"Nenhuma planilha KBM encontrada.")
        
    arquivo_encontrado = arquivos_kbm[0]
    
    try:
        df = pd.read_excel(arquivo_encontrado)
        return df.fillna("") 
    except Exception as e:
        raise Exception(f"O Pandas falhou ao ler o Excel. Erro: {str(e)}")

def carregar_impressoras_movimex():
    import pandas as pd
    arquivos_imp = glob.glob(os.path.join(DATABASE_DIR, "printer*.xlsx"))
    
    if not arquivos_imp:
        arquivos_imp_fallback = glob.glob(os.path.join(BASE_DIR, "printer*.xlsx"))
        if not arquivos_imp_fallback:
            return None
        arquivos_imp = arquivos_imp_fallback
        
    try:
        df = pd.read_excel(arquivos_imp[0])
        return df.fillna("")
    except Exception as e:
        return None

@app.get("/api/impressora/{impressora_id}")
def buscar_impressora_movimex(impressora_id: str):
    impressora_limpa = impressora_id.strip().upper()
    
    if re.match(r"^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$", impressora_limpa):
        return {"id": f"PRN-{impressora_limpa}", "ip": impressora_limpa, "status": "IP Direto"}

    df_imp = carregar_impressoras_movimex()
    if df_imp is not None and not df_imp.empty:
        # Import local para uso na filtragem do df
        import pandas as pd
        match = df_imp[df_imp['Nome'].astype(str).str.strip().str.upper() == impressora_limpa]
        if not match.empty:
            return {"id": impressora_limpa, "ip": str(match.iloc[0]['IP']).strip(), "status": "Base Excel"}

    try:
        ip_resolvido = socket.gethostbyname(impressora_limpa)
        return {"id": impressora_limpa, "ip": ip_resolvido, "status": "DNS"}
    except socket.gaierror:
        pass 

    raise HTTPException(status_code=404, detail="Impressora não encontrada.")

@app.get("/api/busca/{termo}")
def buscar_geral_movimex(termo: str):
    try:
        import pandas as pd
        import re
        
        df = carregar_dados_movimex()
        
        termo_limpo = termo.strip().upper()
        df.columns = df.columns.str.strip()
        
        def limpar_coluna(coluna):
            serie_texto = coluna.apply(lambda x: str(x) if pd.notna(x) else "")
            serie_texto = serie_texto.str.strip()
            serie_texto = serie_texto.str.replace(r'\.0$', '', regex=True)
            serie_texto = serie_texto.str.upper()
            return serie_texto

        col_nota = limpar_coluna(df['Número do Documento Fiscal']) if 'Número do Documento Fiscal' in df.columns else limpar_coluna(df.iloc[:, 0])
        col_pn = limpar_coluna(df['Part Number']) if 'Part Number' in df.columns else limpar_coluna(df.iloc[:, 4])
        col_kinross = limpar_coluna(df['Codigo Kinross']) if 'Codigo Kinross' in df.columns else limpar_coluna(df.iloc[:, 5])
        
        match_nota = df[col_nota == termo_limpo]
        match_pn = df[col_pn == termo_limpo]
        match_kin = df[col_kinross == termo_limpo]
        
        df_resultado = pd.concat([match_nota, match_pn, match_kin]).drop_duplicates()
        
        if df_resultado.empty:
            raise HTTPException(status_code=404, detail="Nenhum registro correspondente foi encontrado no Excel.")
            
        resultado = []
        for _, row in df_resultado.iterrows():
            nota_origem = str(row['Número do Documento Fiscal']).replace('.0', '').strip() if 'Número do Documento Fiscal' in df.columns else str(row.iloc[0]).replace('.0', '').strip()
            part_number = str(row['Part Number']).replace('.0', '').strip() if 'Part Number' in df.columns else str(row.iloc[4]).replace('.0', '').strip()
            codigo = str(row['Codigo Kinross']).replace('.0', '').strip() if 'Codigo Kinross' in df.columns else str(row.iloc[5]).replace('.0', '').strip()
            descricao = str(row['Description']).strip() if 'Description' in df.columns else str(row.iloc[6]).strip()
            endereco = str(row['Description Line 2']).strip() if 'Description Line 2' in df.columns and pd.notna(row['Description Line 2']) else "N/A"
            
            qtd_nome = 'Quantidade Comercial'
            for col in df.columns:
                if 'Quantidade Comercial' in col:
                    qtd_nome = col
                    break
                    
            try:
                qtd = int(float(row[qtd_nome])) if qtd_nome in df.columns and pd.notna(row[qtd_nome]) else 1
            except:
                qtd = 1
                
            zpl = str(row['Formula']).strip() if 'Formula' in df.columns and pd.notna(row['Formula']) else ""
            
            resultado.append({
                "codigo": codigo,
                "part_number": part_number,
                "descricao": descricao,
                "qtdOriginal": qtd,
                "volume": endereco,
                "zpl": zpl,
                "nota_origem": nota_origem
            })
            
        tipo_de_busca = "NOTA" if not match_nota.empty else "ITEM"
        return {"termo": termo_limpo, "tipo": tipo_de_busca, "itens": resultado}
        
    except HTTPException:
        raise 
    except Exception as e:
        erro_detalhado = traceback.format_exc()
        print(erro_detalhado) 
        raise HTTPException(status_code=500, detail=f"CRASH: {str(e)}")

@app.post("/api/imprimir")
def imprimir_etiqueta_movimex(req: ImprimirRequest):
    zpl_original = req.zpl_formula.replace('¨', '') 
    qtd_print = req.quantidade if req.tipo == 'individual' else 1
    
    zpl_pronto = re.sub(r'\^PQ\d+', f'^PQ{qtd_print}', zpl_original) if re.search(r'\^PQ\d+', zpl_original) else zpl_original.replace('^XZ', f'^PQ{qtd_print}^XZ')
    
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(3)
            s.connect((req.impressora_ip, IMPRESSORA_PORTA))
            s.sendall(zpl_pronto.encode('utf-8'))
        return {"status": "sucesso"}
    except Exception:
        raise HTTPException(status_code=500, detail="Impressora offline.")

@app.get("/users/{username}/attributes")
def get_all_attributes(username: str, creds: dict = Depends(get_current_credentials)):
    conn = get_ldap_connection(creds)
    try:
        # Usa ldap3.ALL_ATTRIBUTES (*) para trazer o dicionário completo do objeto
        conn.search(creds['search_base'], f"(sAMAccountName={username})", search_scope=ldap3.SUBTREE, attributes=ldap3.ALL_ATTRIBUTES)
        if not conn.entries:
            raise HTTPException(status_code=404, detail="Objeto não encontrado para leitura de atributos.")
        
        entry = conn.entries[0]
        attrs = {}
        
        # Varre todos os atributos brutos encontrados e formata para o frontend
        for attr_name in entry.entry_attributes_as_dict.keys():
            val = entry[attr_name].value
            if isinstance(val, list):
                attrs[attr_name] = ", ".join([str(v) for v in val])
            elif isinstance(val, datetime):
                attrs[attr_name] = val.strftime('%d/%m/%Y %H:%M:%S')
            else:
                attrs[attr_name] = str(val)
        
        # Retorna os atributos ordenados alfabeticamente
        return {"data": dict(sorted(attrs.items()))}
    finally:
        conn.unbind()

# ==========================================================
# MÓDULO FRONTEND (HOSPEDAGEM DOS DOIS SISTEMAS REACT)
# ==========================================================
MOVIMEX_DIST_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "movimex-dist")
PWA_DIST_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "kad-pwa", "dist")

# ----------------------------------------------------------
# 1. ROTAS BLINDADAS DO MOVIMEX
# ----------------------------------------------------------
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
        return FileResponse(caminho_real)
    return FileResponse(os.path.join(MOVIMEX_DIST_DIR, "index.html"))

# ----------------------------------------------------------
# 2. ROTAS DO KAD MOBILE (ORIGINAL)
# ----------------------------------------------------------
if os.path.exists(PWA_DIST_DIR):
    assets_dir = os.path.join(PWA_DIST_DIR, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="kad_assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_pwa(full_path: str):
        if full_path.startswith("api/") or full_path.startswith("Movimex/"):
            raise HTTPException(status_code=404, detail="Não encontrado no escopo do KAD.")

        file_path = os.path.join(PWA_DIST_DIR, full_path)
        if full_path and os.path.exists(file_path) and os.path.isfile(file_path):
            return FileResponse(file_path)
        
        if full_path.endswith(('.ico', '.png', '.svg', '.webmanifest')):
            return FileResponse(file_path, status_code=404)

        return FileResponse(os.path.join(PWA_DIST_DIR, "index.html"))
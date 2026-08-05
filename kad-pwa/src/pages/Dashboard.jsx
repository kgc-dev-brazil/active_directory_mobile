import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import toast, { Toaster } from 'react-hot-toast';
import { 
  User, Monitor, Users, Search, Layers, Scale, Database, Printer, 
  CheckCircle, Ban, Unlock, Activity, BarChart, ArrowRight, ArrowLeft, 
  Tag, LogOut, Settings, Server, Trash2, RefreshCw, AlertTriangle,
  FileText, Copy, Clock, X, Bell
} from 'lucide-react';

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('single'); 
  const [innerTab, setInnerTab] = useState('geral');

  // Estados: Busca AD
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [newPassword, setNewPassword] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [forceChange, setForceChange] = useState(true);
  const [unlockAccount, setUnlockAccount] = useState(true);
  const [localGroups, setLocalGroups] = useState(null);
  const [loadingGroups, setLoadingGroups] = useState(false);

  // Estados: Modais e Confirmações
  const [modalEditOpen, setModalEditOpen] = useState(false);
  const [editData, setEditData] = useState({ title: '', department: '', telephone: '' });
  const [modalMoveOpen, setModalMoveOpen] = useState(false);
  const [ouList, setOuList] = useState([]);
  const [selectedOu, setSelectedOu] = useState('');
  const [loadingOus, setLoadingOus] = useState(false);

  // Modal de Confirmação Customizado
  const [confirmConfig, setConfirmConfig] = useState({ isOpen: false, title: '', message: '', action: null });
  // Estados: Modal LAPS/BitLocker
  const [modalSecurityOpen, setModalSecurityOpen] = useState(false);
  const [securityData, setSecurityData] = useState({ laps: '', bitlocker: [] });
  const [securityLoading, setSecurityLoading] = useState(false);

  // Estados: Terminal
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalTitle, setTerminalTitle] = useState('');
  const [terminalContent, setTerminalContent] = useState('');
  const [terminalLoading, setTerminalLoading] = useState(false);

  // Estados: Lote & Comparador
  const [bulkInput, setBulkInput] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);
  const [compareInput, setCompareInput] = useState('');
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareResult, setCompareResult] = useState(null);

  // Estados: Vetorh
  // Antes: const [vetorhData, setVetorhData] = useState({ tipcol: 1, techacc: 'NTU' });
  const [vetorhData, setVetorhData] = useState({ tipcol: 1, techacc: 'NTU', sitafa: '...', igadigid: '...' });
  const [vetorhStatus, setVetorhStatus] = useState('Aguardando...');
  const [vetorhLoading, setVetorhLoading] = useState(false);

  // Estados: Impressoras
  const [printServer, setPrintServer] = useState('');
  const [printersList, setPrintersList] = useState([]);
  const [printersLoading, setPrintersLoading] = useState(false);

  const navigate = useNavigate();
  const handleLogout = () => { localStorage.removeItem('@kad_token'); navigate('/'); };

  // --- NOVO: FORÇAR ATUALIZAÇÃO DO SERVICE WORKER E DO CACHE DO PWA ---
  const handleForceUpdate = () => {
    toast.loading('Atualizando aplicativo...', { duration: 2000 });
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (let registration of registrations) {
          registration.update();
        }
      });
    }
    if ('caches' in window) {
      caches.keys().then((names) => {
        for (let name of names) caches.delete(name);
      });
    }
    setTimeout(() => {
      window.location.reload(true);
    }, 500);
  };

  // Helper para chamar o Modal de Confirmação
  const showConfirm = (title, message, action) => {
    setConfirmConfig({ isOpen: true, title, message, action });
  };

  const handleConfirmAction = () => {
    if (confirmConfig.action) confirmConfig.action();
    setConfirmConfig({ ...confirmConfig, isOpen: false });
  };

  // --- MELHORIA 2: HISTÓRICO DE BUSCAS RECENTES (LOCALSTORAGE) ---
  const [recentSearches, setRecentSearches] = useState(() => {
    const saved = localStorage.getItem('@kad_recent_searches');
    return saved ? JSON.parse(saved) : [];
  });

  // Função para zerar o histórico local
  const clearRecentSearches = () => {
    localStorage.removeItem('@kad_recent_searches');
    setRecentSearches([]);
    toast.success('Histórico de buscas limpo!');
  };

  const saveRecentSearch = (term) => {
    if (!term) return;
    const cleanTerm = term.trim().toUpperCase();
    setRecentSearches(prev => {
      const updated = [cleanTerm, ...prev.filter(i => i !== cleanTerm)].slice(0, 5);
      localStorage.setItem('@kad_recent_searches', JSON.stringify(updated));
      return updated;
    });
  };

  // --- MELHORIA 3: ESTADOS DO VISOR DE AUDITORIA ---
  const [modalAuditOpen, setModalAuditOpen] = useState(false);
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);

  const handleOpenAudit = async () => {
    setModalAuditOpen(true);
    setAuditLoading(true);
    try {
      const response = await api.get('/audit/latest?limit=20');
      setAuditLogs(response.data.data || []);
    } catch (err) {
      toast.error('Erro ao consultar histórico de auditoria.');
    } finally {
      setAuditLoading(false);
    }
  };

  // --- ESTADO: ATIVAR WINRM VIA DCOM ---
  const [winrmLoading, setWinrmLoading] = useState(false);

  const handleEnableWinRM = async () => {
    setWinrmLoading(true);
    try {
      const res = await api.post(`/computers/${selectedUser.SamAccountName}/enable-winrm`);
      toast.success(res.data.message);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Falha ao habilitar WinRM. DCOM bloqueado ou máquina offline.');
    } finally {
      setWinrmLoading(false);
    }
  };

  // --- ESTADOS: NOTIFICAR USUÁRIO ATIVO DO DESKTOP ---
  const [modalNotifyOpen, setModalNotifyOpen] = useState(false);
  const [notifyMessage, setNotifyMessage] = useState('');
  const [notifyLoading, setNotifyLoading] = useState(false);

  const handleSendNotification = async () => {
    if (!notifyMessage.trim()) {
      return toast.error('Digite a mensagem antes de disparar o alerta.');
    }
    setNotifyLoading(true);
    try {
      const res = await api.post(`/computers/${selectedUser.SamAccountName}/notify`, {
        message: notifyMessage.trim()
      });
      toast.success(res.data.message);
      setNotifyMessage('');
      setModalNotifyOpen(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao enviar notificação. Máquina inacessível.');
    } finally {
      setNotifyLoading(false);
    }
  };

  // --- MONITOR DE ATIVAÇÃO DE USUÁRIOS (WATCHDOG AD) ---
  const [monitoredUsers, setMonitoredUsers] = useState(() => {
    const saved = localStorage.getItem('@kad_monitored_users');
    return saved ? JSON.parse(saved) : [];
  });

  // Salva no localStorage sempre que a lista de monitorados mudar
  React.useEffect(() => {
    localStorage.setItem('@kad_monitored_users', JSON.stringify(monitoredUsers));
  }, [monitoredUsers]);

  // Checa o status dos usuários monitorados a cada 30 segundos em segundo plano
  React.useEffect(() => {
    if (monitoredUsers.length === 0) return;

    const interval = setInterval(async () => {
      for (const username of monitoredUsers) {
        try {
          const res = await api.get(`/users/${username}`);
          const u = res.data.data?.[0];
          
          // Se a conta virou Ativa (Enabled === true)
          if (u && u.Enabled) {
            // 1. Dispara Notificação Nativa do Celular / Windows
            if ("Notification" in window && Notification.permission === "granted") {
              new Notification("✅ Usuário Habilitado no AD!", {
                body: `A conta de ${u.DisplayName} (${u.SamAccountName}) está ativa agora.`,
                icon: "/pwa-192x192.png"
              });
            }
            
            // 2. Alerta sonoro/visual dentro do app
            toast.success(`🎉 O usuário ${u.SamAccountName} foi habilitado no AD!`, {
              duration: 8000,
              icon: '✅'
            });

            // 3. Remove da lista de monitoramento
            setMonitoredUsers(prev => prev.filter(item => item !== username));
            
            // Se for o usuário que está aberto na tela, recarrega os dados
            if (selectedUser?.SamAccountName === username) {
              selectUserForDetail(u);
            }
          }
        } catch (err) {
          console.error(`Falha ao checar status de ${username}`);
        }
      }
    }, 30000); // 30000 ms = checa a cada 30 segundos

    return () => clearInterval(interval);
  }, [monitoredUsers, selectedUser]);

  // Função para ativar/desativar o monitoramento de uma conta
  const toggleMonitorUser = async (username) => {
    // Pede permissão para mandar notificação no celular (se ainda não tiver)
    if ("Notification" in window && Notification.permission === "default") {
      await Notification.requestPermission();
    }

    setMonitoredUsers(prev => {
      const exists = prev.includes(username);
      if (exists) {
        toast.error(`Monitoramento cancelado para ${username}.`);
        return prev.filter(i => i !== username);
      } else {
        toast.success(`⏳ Monitorando ${username}! Você será notificado quando for habilitado.`);
        return [...prev, username];
      }
    });
  };

  // --- MELHORIA 1: COPIAR RESUMO DO CHAMADO PARA TEAMS/WHATSAPP ---
  const copiarResumoCredenciais = () => {
    if (!selectedUser || !newPassword) {
      return toast.error('Gere ou digite uma senha antes de copiar o resumo.');
    }
    const texto = `🔒 *Atualização de Credenciais - KAD Mobile*\n\n` +
      `👤 *Usuário:* ${selectedUser.SamAccountName}\n` +
      `🔑 *Senha Provisória:* ${newPassword}\n` +
      `ℹ️ *Status:* Conta desbloqueada.\n` +
      `⚠️ *Nota:* ${forceChange ? 'Será exigida a alteração da senha no primeiro logon.' : 'Senha configurada em modo contínuo.'}`;
    
    navigator.clipboard.writeText(texto);
    toast.success('Resumo copiado para a área de transferência!');
  };

  // --- MELHORIA 5: TRAVA DE DIGITAÇÃO ANTI-ERRO NO MODAL ---
  const [confirmInputText, setConfirmInputText] = useState('');
  const [requireSecurityWord, setRequireSecurityWord] = useState(false);

  // Gerador de Senha Forte
  const gerarSenhaAleatoria = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*';
    let senha = 'K1@';
    for (let i = 0; i < 9; i++) {
      senha += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setNewPassword(senha);
  };

  // ESTADO: Resumo do AD (Opção 4)
  const [summaryData, setSummaryData] = useState({ locked_users: 0, pending_passwords: 0, status: '...' });

  const fetchSummary = async () => {
    try {
      const res = await api.get('/dashboard/summary');
      setSummaryData(res.data);
    } catch (err) {
      if (err.response?.status === 401) {
        toast.error('Sessão expirada. Por favor, faça login novamente.');
        handleLogout();
      } else {
        console.error('Falha ao carregar resumo da tela inicial');
      }
    }
  };

  // Carrega os cards automaticamente ao abrir o Dashboard
  React.useEffect(() => {
    fetchSummary();
  }, []);

  // Carrega os cards automaticamente ao abrir o Dashboard
  React.useEffect(() => {
    fetchSummary();
  }, []);

  // ESTADO: Adicionar / Remover Grupo (Opção 2)
  const [newGroupName, setNewGroupName] = useState('');
  const [groupLoading, setGroupLoading] = useState(false);

  const handleAddGroup = async () => {
    if (!newGroupName.trim()) return toast.error('Digite o nome do grupo.');
    setGroupLoading(true);
    try {
      const res = await api.post(`/users/${selectedUser.SamAccountName}/groups/add`, {
        group_name: newGroupName.trim()
      });
      toast.success(res.data.message);
      setNewGroupName('');
      handleSearch(); // Recarrega o usuário atualizado
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Falha ao adicionar grupo.');
    } finally {
      setGroupLoading(false);
    }
  };

  const handleRemoveGroup = (groupName) => {
    showConfirm(
      'Remover do Grupo',
      `Tem certeza que deseja remover ${selectedUser.SamAccountName} do grupo "${groupName}"?`,
      async () => {
        try {
          const res = await api.post(`/users/${selectedUser.SamAccountName}/groups/remove`, {
            group_name: groupName
          });
          toast.success(res.data.message);
          handleSearch();
        } catch (err) {
          toast.error(err.response?.data?.detail || 'Erro ao remover do grupo.');
        }
      }
    );
  };

  // ==================== FUNÇÕES CORE AD ====================
  const handleSearch = async (e) => {
    if (e) e.preventDefault();
    if (!searchTerm.trim()) return;
    
    saveRecentSearch(searchTerm);
    setLoading(true); setError(''); setSearchResults([]); setSelectedUser(null); setNewPassword(''); setLocalGroups(null); setInnerTab('geral');
    try {
      const response = await api.get(`/users/${searchTerm}`);
      setSearchResults(response.data.data);
      if (response.data.data.length === 1) selectUserForDetail(response.data.data[0]);
    } catch (err) { setError(err.response?.status === 404 ? 'Nenhum resultado localizado no diretório.' : 'Erro de conexão.'); } 
    finally { setLoading(false); }
  };

  const selectUserForDetail = (user) => {
    setSelectedUser(user);
    setEditData({ title: user.Title || '', department: user.Department || '', telephone: user.TelephoneNumber || '' });
    
    // Zera os dados enquanto busca
    setVetorhData({ tipcol: 1, techacc: 'NTU', sitafa: 'Carregando...', igadigid: 'Carregando...' });

    if (user.Type === 'User' && user.EmployeeID) {
      setVetorhStatus('Consultando DB...');
      setVetorhLoading(true);
      api.get(`/vetorh/${user.EmployeeID}`)
        .then(res => {
          const fetchedTipcol = parseInt(res.data.tipcol) || 1;
          const fetchedTechacc = res.data.techacc ? res.data.techacc.trim().toUpperCase() : 'NTU';
          const fetchedSitafa = res.data.sitafa || 'Desconhecido';
          const fetchedIgadigid = res.data.igadigid || 'N/A';
          const tipoStr = fetchedTipcol === 1 ? 'Próprio' : 'Terceiro';
          
          // Atualiza os novos campos
          setVetorhData({ tipcol: fetchedTipcol, techacc: fetchedTechacc, sitafa: fetchedSitafa, igadigid: fetchedIgadigid });

          if (res.data.error) setVetorhStatus(`Erro: ${res.data.error}`);
          else if (res.data.message) setVetorhStatus(res.data.message);
          else setVetorhStatus(`${fetchedTechacc} (${tipoStr})`);
        })
        .catch(() => {
          setVetorhStatus('Falha de conexão com SQL');
          setVetorhData(prev => ({ ...prev, sitafa: 'Erro SQL', igadigid: 'Erro SQL' }));
        })
        .finally(() => setVetorhLoading(false));
    } else {
      setVetorhStatus('Sem Matrícula');
      setVetorhData({ tipcol: 1, techacc: 'NTU', sitafa: 'N/A', igadigid: 'N/A' });
    }
  };

  // ==================== VETORH (SQL) ====================
  const saveVetorh = async () => {
    setVetorhLoading(true);
    try {
      await api.post('/vetorh/update', { matriculas: [selectedUser.EmployeeID], tipcol: vetorhData.tipcol, techacc: vetorhData.techacc });
      toast.success('Integração com Vetorh executada com sucesso.');
      setVetorhStatus(`${vetorhData.techacc} (${vetorhData.tipcol === 1 ? 'Próprio' : 'Terceiro'})`);
    } catch (err) { toast.error(err.response?.data?.detail || 'Falha ao atualizar banco de dados.'); } 
    finally { setVetorhLoading(false); }
  };

  // ==================== IMPRESSORAS ====================
  const handleSearchPrinters = async (e) => {
    if (e) e.preventDefault();
    if (!printServer.trim()) return;
    setPrintersLoading(true); setPrintersList([]);
    try {
      const response = await api.get(`/printers/${printServer}`);
      const dadosRetorno = response.data.data;
      const dataArray = Array.isArray(dadosRetorno) ? dadosRetorno : (dadosRetorno ? [dadosRetorno] : []);
      setPrintersList(dataArray);
      if(dataArray.length === 0) toast.error('Nenhuma impressora encontrada.');
    } catch (err) { toast.error(err.response?.data?.detail || 'Falha ao comunicar com o servidor.'); } 
    finally { setPrintersLoading(false); }
  };

  const clearQueue = (queue) => {
    showConfirm('Limpar Fila de Impressão', `Tem certeza que deseja remover todos os documentos travados na fila ${queue}?`, async () => {
      try { await api.post(`/printers/${printServer}/${queue}/clear`); toast.success('Fila de impressão esvaziada.'); } 
      catch (err) { toast.error(err.response?.data?.detail || 'Erro ao limpar fila.'); }
    });
  };

  const restartSpooler = () => {
    showConfirm('Reiniciar Serviço de Spooler', `Atenção: Reiniciar o Spooler em ${printServer} derrubará conexões ativas momentaneamente. Prosseguir?`, async () => {
      try { await api.post(`/printers/${printServer}/restart-spooler`); toast.success('Serviço de Spooler reiniciado remotamente.'); } 
      catch (err) { toast.error(err.response?.data?.detail || 'Erro na operação remota.'); }
    });
  };

  const runPrintDiagnostic = async (type) => {
    if (!printServer) return;
    setTerminalTitle(`Terminal | ${type.toUpperCase()} - ${printServer}`);
    setTerminalContent(`[SYS] Iniciando varredura remota para ${printServer}...\n\n`);
    setTerminalOpen(true); setTerminalLoading(true);
    try {
      const response = await api.get(`/diagnostics/${printServer}/${type}`);
      setTerminalContent(prev => prev + response.data.output + '\n\n[SYS] Processo finalizado.');
    } catch (err) { setTerminalContent(prev => prev + '\n[ERRO] Falha crítica de comunicação com o servidor.'); } 
    finally { setTerminalLoading(false); }
  };

  const pingPrinter = async (printerName, portName) => {
    const ipMatch = portName?.match(/\d{1,3}(\.\d{1,3}){3}/);
    const targetIp = ipMatch ? ipMatch[0] : portName;

    if (!targetIp) return toast.error('Porta TCP/IP não identificada.');

    setTerminalTitle(`Terminal | PING - ${printerName} (${targetIp})`);
    setTerminalContent(`[SYS] Disparando pacotes ICMP para ${targetIp}...\n\n`);
    setTerminalOpen(true); setTerminalLoading(true);
    try {
      const response = await api.get(`/diagnostics/${targetIp}/ping`);
      setTerminalContent(prev => prev + response.data.output + '\n\n[SYS] Processo finalizado.');
    } catch (err) {
      setTerminalContent(prev => prev + '\n[ERRO] Falha ao pingar a impressora.');
    } finally {
      setTerminalLoading(false);
    }
  };

  // ==================== DIAGNÓSTICOS ====================
  const runDiagnostic = async (type) => {
    const target = type === 'splunk' ? selectedUser.SamAccountName : (selectedUser.OS ? selectedUser.DisplayName : selectedUser.SamAccountName);
    setTerminalTitle(`Terminal | ${type.toUpperCase()}`);
    setTerminalContent(`[SYS] Iniciando varredura remota para ${target}...\n\n`);
    setTerminalOpen(true); setTerminalLoading(true);
    try {
      const response = await api.get(`/diagnostics/${target}/${type}`);
      setTerminalContent(prev => prev + response.data.output + '\n\n[SYS] Processo finalizado.');
    } catch (err) { setTerminalContent(prev => prev + '\n[ERRO] Falha crítica de comunicação.'); } 
    finally { setTerminalLoading(false); }
  };

  // ==================== COMPARADOR E LOTE ====================
  const handleCompare = async () => {
    const usersArray = compareInput.split(',').map(u => u.trim()).filter(u => u !== '');
    if (usersArray.length < 2) return toast.error('Requer mínimo de 2 identidades para comparação.');
    setCompareLoading(true); setCompareResult(null);
    try { const response = await api.post('/compare', { usernames: usersArray }); setCompareResult(response.data); toast.success('Matriz gerada com sucesso.'); } 
    catch (err) { toast.error('Erro ao cruzar os dados de permissão.'); } finally { setCompareLoading(false); }
  };

  const handleBulkAction = (actionType) => {
    const usersArray = bulkInput.split(',').map(u => u.trim()).filter(u => u !== '');
    if (usersArray.length === 0) return toast.error('Insira os identificadores antes de continuar.');
    
    const isDestructive = actionType === 'disable';
    setRequireSecurityWord(isDestructive);
    setConfirmInputText('');

    showConfirm(
      'Processamento em Lote', 
      isDestructive 
        ? `Atenção! Você está prestes a DESATIVAR ${usersArray.length} objeto(s). Digite "CONFIRMAR" para autorizar.`
        : `Deseja executar a ação em massa para ${usersArray.length} objeto(s)?`, 
      async () => {
        setBulkLoading(true); setBulkResult(null);
        try { 
          const response = await api.post(`/bulk/${actionType}`, { usernames: usersArray }); 
          setBulkResult(response.data); 
          toast.success('Lote finalizado.'); 
        } catch (err) { 
          toast.error('Falha crítica ao processar o lote.'); 
        } finally { 
          setBulkLoading(false); 
        }
      }
    );
  };

  // --- ESTADOS: VETORH DIRETO (DESKTOP MODE) ---
  const [vetorhDirectInput, setVetorhDirectInput] = useState('');
  const [vetorhDirectTipcol, setVetorhDirectTipcol] = useState(1);
  const [vetorhDirectTechacc, setVetorhDirectTechacc] = useState('NTU');
  const [vetorhDirectLoading, setVetorhDirectLoading] = useState(false);
  const [vetorhDirectResult, setVetorhDirectResult] = useState(null);

  // Consulta individual de teste por Matrícula
  const [vetorhSearchMat, setVetorhSearchMat] = useState('');
  const [vetorhSearchResult, setVetorhSearchResult] = useState(null);
  const [vetorhSearchLoading, setVetorhSearchLoading] = useState(false);

  const handleVetorhDirectSearch = async (e) => {
    if (e) e.preventDefault();
    if (!vetorhSearchMat.trim()) return;
    
    setVetorhSearchLoading(true);
    setVetorhSearchResult(null);
    
    // MELHORIA 2: Auto-preenche o campo da Procedure com as matrículas pesquisadas!
    setVetorhDirectInput(vetorhSearchMat.trim());
    
    try {
      const res = await api.get(`/vetorh/search/${vetorhSearchMat.trim()}`);
      setVetorhSearchResult(res.data.data); // Recebe o Array
    } catch (err) {
      toast.error('Falha ao consultar matrículas no SQL Server.');
    } finally {
      setVetorhSearchLoading(false);
    }
  };

  const handleVetorhDirectUpdate = async () => {
    const matriculasArray = vetorhDirectInput
      .split(/[,;\n]/)
      .map(m => m.trim())
      .filter(m => m !== '' && !isNaN(m));

    if (matriculasArray.length === 0) {
      return toast.error('Insira pelo menos uma matrícula numérica válida.');
    }

    showConfirm(
      'Procedure Vetorh (SQL Server)',
      `Deseja aplicar o acesso "${vetorhDirectTechacc}" (Tipo ${vetorhDirectTipcol}) para ${matriculasArray.length} matrícula(s)?`,
      async () => {
        setVetorhDirectLoading(true);
        setVetorhDirectResult(null);
        try {
          const res = await api.post('/vetorh/update', {
            matriculas: matriculasArray,
            tipcol: Number(vetorhDirectTipcol),
            techacc: vetorhDirectTechacc
          });
          setVetorhDirectResult(res.data);
          toast.success('Procedure executada no banco com sucesso!');
        } catch (err) {
          toast.error(err.response?.data?.detail || 'Erro ao executar procedure.');
        } finally {
          setVetorhDirectLoading(false);
        }
      }
    );
  };

  // ==================== AÇÕES BÁSICAS AD ====================
  const handleUnlock = async () => { 
    try { await api.post(`/users/${selectedUser.SamAccountName}/unlock`); toast.success('Conta desbloqueada com sucesso.'); handleSearch(); } 
    catch (err) { toast.error(err.response?.data?.detail || 'Erro ao desbloquear conta.'); } 
  };
  
  const handleResetPassword = async () => {
    if (!newPassword || newPassword.length < 8) return toast.error('A senha deve conter no mínimo 8 caracteres.');
    setResetLoading(true);
    try { 
      await api.post(`/users/${selectedUser.SamAccountName}/reset-password`, { 
        new_password: newPassword, 
        force_change: forceChange,
        unlock_account: unlockAccount
      }); 
      toast.success('Credenciais redefinidas com sucesso!'); 
      setNewPassword(''); 
    } catch (err) { 
      toast.error(err.response?.data?.detail || 'Erro ao resetar senha.'); 
    } finally { 
      setResetLoading(false); 
    }
  };

  const handleToggleStatus = () => {
    const acaoText = selectedUser.Enabled ? 'desativar' : 'ativar';
    showConfirm('Alteração de Status', `Deseja realmente ${acaoText} este objeto no Active Directory?`, async () => {
      try { await api.post(`/users/${selectedUser.SamAccountName}/toggle-status`); toast.success('Status modificado com sucesso.'); handleSearch(); } 
      catch (err) { toast.error(err.response?.data?.detail || 'Falha ao alterar status.'); }
    });
  };

  const handleSaveProfile = async () => { 
    try { await api.post(`/users/${selectedUser.SamAccountName}/edit-profile`, editData); toast.success('Perfil atualizado.'); setModalEditOpen(false); handleSearch(); } 
    catch (err) { toast.error('Erro ao atualizar perfil.'); } 
  };

  const openMoveModal = async () => {
    setModalMoveOpen(true); if (ouList.length > 0) return; setLoadingOus(true);
    try { const response = await api.get('/ous'); setOuList(response.data.data); } 
    catch (err) { toast.error('Falha ao obter árvore de diretórios.'); } finally { setLoadingOus(false); }
  };

  const handleMoveOu = async () => { 
    try { await api.post(`/users/${selectedUser.SamAccountName}/move`, { new_ou: selectedOu }); toast.success('Objeto movido organizacionalmente.'); setModalMoveOpen(false); handleSearch(); } 
    catch (err) { toast.error('Erro ao movimentar OU.'); } 
  };

  const fetchLocalGroups = async () => { 
    setLoadingGroups(true); 
    try { 
      const response = await api.get(`/computers/${selectedUser.SamAccountName}/local-groups`); 
      const dt = response.data.data;
      const arr = Array.isArray(dt) ? dt : (dt ? [dt] : []);
      setLocalGroups(arr); 
      toast.success('Grupos mapeados.'); 
    } catch (err) { 
      toast.error(err.response?.data?.detail || 'Falha via WinRM. Computador inacessível.'); 
    } finally { 
      setLoadingGroups(false); 
    } 
  };

  const fetchSecurityKeys = async () => {
    setModalSecurityOpen(true);
    setSecurityLoading(true);
    try {
      const response = await api.get(`/computers/${selectedUser.SamAccountName}/security`);
      setSecurityData(response.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Acesso negado ou erro ao ler chaves.');
      setModalSecurityOpen(false);
    } finally {
      setSecurityLoading(false);
    }
  };

  const isUser = selectedUser?.Type === 'User';
  const isComputer = selectedUser?.Type === 'Computer';
  const isGroup = selectedUser?.Type === 'Group';

  const renderIcon = (type, size = 20) => {
    if (type === 'User') return <User size={size} />;
    if (type === 'Computer') return <Monitor size={size} />;
    if (type === 'Group') return <Users size={size} />;
    return <Tag size={size} />;
  };

  return (
    <div style={styles.container}>
      {/* COMPONENTE TOASTER */}
      <Toaster position="top-right" toastOptions={{ style: { background: COLORS.cell, color: COLORS.text, border: `1px solid ${COLORS.border}`, fontSize: '13px' }, success: { iconTheme: { primary: COLORS.success, secondary: COLORS.bg } }, error: { iconTheme: { primary: COLORS.danger, secondary: COLORS.bg } } }} />

      {/* ==================================================== */}
      {/* CONTAINER FIXO NO TOPO (HEADER + ABAS)               */}
      {/* ==================================================== */}
      <div style={{ position: 'sticky', top: 0, zIndex: 100, backgroundColor: COLORS.bg }}>
        
        {/* HEADER */}
        <div style={styles.header}>
          <div style={styles.headerTitle}>
            <div style={styles.logoBadge}>K</div>
            <h2 style={{ margin: 0, fontSize: '18px', color: COLORS.gold, fontWeight: 600 }}>KAD Mobile</h2>
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            
            {/* --- NOVO: BOTÃO DE ATUALIZAR PWA --- */}
            <button 
              onClick={handleForceUpdate} 
              style={styles.headerIconBtn} 
              title="Forçar Atualização do App"
            >
              <RefreshCw size={18} />
            </button>

            <button onClick={handleOpenAudit} style={styles.headerIconBtn} title="Histórico de Auditoria">
              <FileText size={18} />
            </button>
            <button onClick={handleLogout} style={styles.logoutBtn} title="Sair">
              <LogOut size={18} />
            </button>
          </div>
        </div>

        {/* NAVEGAÇÃO PRINCIPAL */}
        <div style={styles.tabContainer}>
          <button style={activeTab === 'single' ? styles.tabActive : styles.tabInactive} onClick={() => setActiveTab('single')}><Search size={16} /> Identidade</button>
          <button style={activeTab === 'bulk' ? styles.tabActive : styles.tabInactive} onClick={() => setActiveTab('bulk')}><Layers size={16} /> Lote</button>
          <button style={activeTab === 'compare' ? styles.tabActive : styles.tabInactive} onClick={() => setActiveTab('compare')}><Scale size={16} /> Comparador</button>
          <button style={activeTab === 'printers' ? styles.tabActive : styles.tabInactive} onClick={() => setActiveTab('printers')}><Printer size={16} /> Print</button>
          
          {/* NOVA ABA: VETORH DIRETO */}
          <button style={activeTab === 'vetorh_direct' ? styles.tabActive : styles.tabInactive} onClick={() => setActiveTab('vetorh_direct')}><Database size={16} /> Vetorh</button>
        </div>
        
      </div>
      {/* ==================================================== */}

      <div style={styles.content}>
        
        {/* ================= ABA 1: IDENTIDADE ================= */}
        {activeTab === 'single' && (
          <>
            <form onSubmit={handleSearch} style={styles.searchForm}>
              <div style={styles.searchWrapper}>
                <input type="text" placeholder="Nome, Matrícula, Hostname..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={styles.input} />
                <button type="submit" disabled={loading} style={styles.searchBtn}>{loading ? <div style={styles.spinner}></div> : <Search size={20} />}</button>
              </div>
            </form>
            {error && <div style={styles.errorBox}><Ban size={16} /> {error}</div>}

            {/* PÍLULAS DE BUSCAS RECENTES */}
            {recentSearches.length > 0 && !selectedUser && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '15px' }}>
                <span style={{ color: COLORS.muted, fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Clock size={12} /> Recentes:
                </span>
                
                {recentSearches.map((term, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setSearchTerm(term);
                      setTimeout(() => handleSearch(), 50);
                    }}
                    style={styles.recentChip}
                  >
                    {term}
                  </button>
                ))}

                {/* BOTÃO COM ÍCONE DE LIXEIRA PARA LIMPAR HISTÓRICO */}
                <button
                  type="button"
                  onClick={clearRecentSearches}
                  style={styles.clearRecentBtn}
                  title="Limpar histórico de buscas recentes"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            )}

            {/* MELHORIA 4: CARDS DE RESUMO NA TELA INICIAL */}
            {!selectedUser && searchResults.length === 0 && (
              <div style={styles.summaryGrid}>
                <div style={styles.summaryCard}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={styles.summaryLabel}>Contas Bloqueadas</span>
                    <AlertTriangle size={18} color={COLORS.warning} />
                  </div>
                  <h3 style={styles.summaryValueWarning}>{summaryData.locked_users}</h3>
                  <span style={styles.summarySub}>No Active Directory agora</span>
                </div>

                <div style={styles.summaryCard}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={styles.summaryLabel}>Troca Pendente</span>
                    <Clock size={18} color={COLORS.gold} />
                  </div>
                  <h3 style={styles.summaryValueGold}>{summaryData.pending_passwords}</h3>
                  <span style={styles.summarySub}>pwdLastSet = 0</span>
                </div>

                <div style={{ ...styles.summaryCard, gridColumn: '1 / -1' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={styles.summaryLabel}>Status do Serviço LDAP</span>
                    <span style={{ color: COLORS.success, fontWeight: 'bold', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <CheckCircle size={14} /> {summaryData.status}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {searchResults.length > 1 && !selectedUser && (
              <div>
                <p style={{ color: COLORS.gold, marginBottom: '15px', fontWeight: 'bold' }}>Resultados da pesquisa ({searchResults.length}):</p>
                <div style={styles.listGrid}>
                  {searchResults.map((item, idx) => {
                    const isDanger = !item.Enabled || item.LockedOut;
                    return (
                      <div key={idx} onClick={() => selectUserForDetail(item)} style={{...styles.miniCard, borderColor: isDanger ? COLORS.danger : COLORS.border}}>
                        <div style={{...styles.miniAvatar, color: isDanger ? COLORS.danger : COLORS.gold, backgroundColor: isDanger ? 'rgba(239, 68, 68, 0.1)' : COLORS.cell}}>
                          {renderIcon(item.Type)}
                        </div>
                        <div style={{ flex: 1 }}>
                          <h4 style={{...styles.miniCardTitle, color: isDanger ? COLORS.danger : COLORS.text}}>
                             {item.DisplayName} {isDanger && <Ban size={12} style={{marginLeft: '6px'}} />}
                          </h4>
                          <p style={styles.miniCardSubtitle}>
                             {item.SamAccountName} {item.EmployeeID ? `• Mat: ${item.EmployeeID}` : ''}
                             {isDanger && <span style={{color: COLORS.danger, fontWeight: 'bold'}}> • ({item.LockedOut ? 'Bloqueado' : 'Desativado'})</span>}
                          </p>
                        </div>
                        <div style={{ color: isDanger ? COLORS.danger : COLORS.gold }}><ArrowRight size={18} /></div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {selectedUser && (
              <div style={styles.card}>
                {searchResults.length > 1 && <button onClick={() => setSelectedUser(null)} style={styles.backBtn}><ArrowLeft size={16} /> Voltar à lista</button>}
                <div style={styles.cardHeader}>
                  <div style={styles.avatar}>{renderIcon(selectedUser.Type, 24)}</div>
                  <div style={{flex: 1}}>
                    <h3 style={styles.cardTitle}>{selectedUser.DisplayName}</h3>
                    <p style={styles.cardSubtitle}>{selectedUser.SamAccountName} {selectedUser.EmployeeID ? `• Matrícula: ${selectedUser.EmployeeID}` : ''}</p>
                  </div>
                </div>

                <div style={styles.statusRow}>
                  <button onClick={handleToggleStatus} style={selectedUser.Enabled ? styles.tagActive : styles.tagInactive}>
                    {selectedUser.Enabled ? <><CheckCircle size={14}/> Ativo (Desativar)</> : <><Ban size={14}/> Desativado (Ativar)</>}
                  </button>
                  {isUser && <span style={selectedUser.LockedOut ? styles.tagLocked : styles.tagUnlocked}>{selectedUser.LockedOut ? <><AlertTriangle size={14}/> Bloqueada</> : <><CheckCircle size={14}/> Sem Bloqueio</>}</span>}
                  <span style={styles.tagType}>{selectedUser.Type}</span>

                  {/* BADGE DE SENHA EXPIRADA OU TROCA PENDENTE */}
                  {isUser && selectedUser.pwdLastSet === 0 && (
                    <span style={{ ...styles.tagLocked, borderColor: COLORS.warning, color: COLORS.warning }}>
                      <AlertTriangle size={14} /> Troca Pendente no Logon
                    </span>
                  )}

                  {/* NOVO: BOTÃO DE MONITORAR QUANDO O USUÁRIO FOR HABILITADO */}
                  {isUser && !selectedUser.Enabled && (
                    <button
                      type="button"
                      onClick={() => toggleMonitorUser(selectedUser.SamAccountName)}
                      style={{
                        ...styles.tagLocked,
                        borderColor: monitoredUsers.includes(selectedUser.SamAccountName) ? COLORS.success : COLORS.gold,
                        color: monitoredUsers.includes(selectedUser.SamAccountName) ? COLORS.success : COLORS.gold,
                        cursor: 'pointer'
                      }}
                    >
                      <Bell size={14} />
                      {monitoredUsers.includes(selectedUser.SamAccountName)
                        ? "Monitorando Ativação..."
                        : "Avisar quando Habilitar"}
                    </button>
                  )}
                </div>

                <div style={styles.innerTabs}>
                  <button style={innerTab === 'geral' ? styles.innerTabActive : styles.innerTabInactive} onClick={() => setInnerTab('geral')}>Geral</button>
                  {isUser && <button style={innerTab === 'seguranca' ? styles.innerTabActive : styles.innerTabInactive} onClick={() => setInnerTab('seguranca')}>Segurança</button>}
                  {isComputer && <button style={innerTab === 'seguranca' ? styles.innerTabActive : styles.innerTabInactive} onClick={() => setInnerTab('seguranca')}>Diagnósticos</button>}
                  <button style={innerTab === 'grupos' ? styles.innerTabActive : styles.innerTabInactive} onClick={() => setInnerTab('grupos')}>
                    {isGroup ? `Membros (${selectedUser.Members?.length || 0})` : `Grupos (${selectedUser.MemberOf?.length || 0})`}
                  </button>
                  {isUser && selectedUser.EmployeeID && <button style={innerTab === 'vetorh' ? styles.innerTabActive : styles.innerTabInactive} onClick={() => setInnerTab('vetorh')}>Vetorh DB</button>}
                </div>

                <div style={styles.innerContent}>
                  
                  {/* ABA GERAL */}
                  {innerTab === 'geral' && (
                    <>
                      {isComputer && (
                        <>
                          <p style={styles.sectionLabel}>Identificação de Rede</p>
                          <div style={styles.detailGrid}>
                            <div style={styles.detailItem}><span style={styles.detailLabel}>DNS</span><span style={styles.detailValue}>{selectedUser.DNS}</span></div>
                            <div style={styles.detailItem}><span style={styles.detailLabel}>IPv4</span><span style={styles.detailValue}>{selectedUser.IPv4}</span></div>
                            <div style={styles.detailItem}><span style={styles.detailLabel}>S. Operacional</span><span style={styles.detailValue}>{selectedUser.OS}</span></div>
                            <div style={styles.detailItem}><span style={styles.detailLabel}>Gerenciado Por</span><span style={styles.detailValue}>{selectedUser.Manager}</span></div>
                            <div style={styles.detailItemFull}><span style={styles.detailLabel}>Descrição</span><span style={styles.detailValue}>{selectedUser.Description}</span></div>
                            <div style={styles.detailItemFull}><span style={styles.detailLabel}>Última Ativação</span><span style={styles.detailValue}>{selectedUser.LastLogon}</span></div>
                          </div>
                        </>
                      )}

                      {isUser && (
                        <>
                          <p style={styles.sectionLabel}>Organização Corporativa</p>
                          <div style={styles.detailGrid}>
                            <div style={styles.detailItemFull}><span style={styles.detailLabel}>E-mail</span><span style={styles.detailValue}>{selectedUser.EmailAddress || 'N/A'}</span></div>
                            <div style={styles.detailItem}><span style={styles.detailLabel}>Telefone</span><span style={styles.detailValue}>{selectedUser.TelephoneNumber}</span></div>
                            <div style={styles.detailItem}><span style={styles.detailLabel}>Cargo</span><span style={styles.detailValue}>{selectedUser.Title}</span></div>
                            <div style={styles.detailItem}><span style={styles.detailLabel}>Departamento</span><span style={styles.detailValue}>{selectedUser.Department}</span></div>
                            <div style={styles.detailItem}><span style={styles.detailLabel}>Empresa</span><span style={styles.detailValue}>{selectedUser.Company}</span></div>
                            <div style={styles.detailItem}><span style={styles.detailLabel}>Escritório</span><span style={styles.detailValue}>{selectedUser.Office}</span></div>
                            <div style={styles.detailItem}><span style={styles.detailLabel}>Gerente Direto</span><span style={styles.detailValue}>{selectedUser.Manager}</span></div>
                            <div style={styles.detailItemFull}>
                              <span style={styles.detailLabel}>Supervisiona ({selectedUser.DirectReports?.length || 0})</span>
                              {selectedUser.DirectReports?.length > 0 ? (
                                <div style={{ 
                                  display: 'flex', 
                                  flexWrap: 'wrap', 
                                  gap: '6px', 
                                  marginTop: '8px', 
                                  maxHeight: '140px', 
                                  overflowY: 'auto',
                                  paddingRight: '4px'
                                }}>
                                  {selectedUser.DirectReports.map((report, idx) => (
                                    <span key={idx} style={{
                                      backgroundColor: COLORS.bg,
                                      border: `1px solid ${COLORS.border}`,
                                      padding: '4px 8px',
                                      borderRadius: '4px',
                                      fontSize: '11px',
                                      color: COLORS.text,
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '4px'
                                    }}>
                                      <User size={10} color={COLORS.muted} /> {report}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span style={styles.detailValue}>Nenhum</span>
                              )}
                            </div>
                          </div>
                          
                          <p style={{...styles.sectionLabel, marginTop: '20px'}}>Identidade e Acessos</p>
                          <div style={styles.detailGrid}>
                            <div style={styles.detailItem}><span style={styles.detailLabel}>Status da Conta</span><span style={{...styles.detailValue, color: selectedUser.Enabled ? COLORS.success : COLORS.danger}}>{selectedUser.Enabled ? 'Ativa' : 'Desativada'}</span></div>
                            <div style={styles.detailItem}><span style={styles.detailLabel}>Bloqueado?</span><span style={{...styles.detailValue, color: selectedUser.LockedOut ? COLORS.warning : COLORS.text}}>{selectedUser.LockedOut ? 'Sim' : 'Não'}</span></div>
                            <div style={styles.detailItemFull}><span style={styles.detailLabel}>Senha Nunca Expira?</span><span style={styles.detailValue}>{selectedUser.PasswordNeverExpires ? 'Sim' : 'Não'}</span></div>
                            <div style={styles.detailItemFull}><span style={styles.detailLabel}>Último Logon</span><span style={styles.detailValue}>{selectedUser.LastLogon}</span></div>
                            
                            {/* LINHAS DO VETORH */}
                            <div style={styles.detailItemFull}><span style={styles.detailLabel}>Acesso Vetorh (Role)</span><span style={{...styles.detailValue, color: COLORS.gold}}>{vetorhStatus}</span></div>
                            
                            <div style={styles.detailItem}><span style={styles.detailLabel}>SITAFA (Situação RH)</span>
                              <span style={{
                                ...styles.detailValue, 
                                color: vetorhData.sitafa.includes('Trabalhando') ? COLORS.success : 
                                       vetorhData.sitafa.includes('Demitido') ? COLORS.danger : COLORS.warning
                              }}>{vetorhData.sitafa}</span>
                            </div>
                            
                            <div style={styles.detailItem}><span style={styles.detailLabel}>IGA DIGID</span><span style={{...styles.detailValue, fontFamily: 'monospace'}}>{vetorhData.igadigid}</span></div>
                          </div>
                        </>
                      )}

                      {isGroup && (
                        <>
                          <p style={styles.sectionLabel}>Especificações do Grupo</p>
                          <div style={styles.detailGrid}>
                            <div style={styles.detailItemFull}><span style={styles.detailLabel}>Nome (Display)</span><span style={styles.detailValue}>{selectedUser.DisplayName}</span></div>
                            <div style={styles.detailItem}><span style={styles.detailLabel}>Categoria (Cat)</span><span style={styles.detailValue}>{selectedUser.GroupCategory}</span></div>
                            <div style={styles.detailItem}><span style={styles.detailLabel}>Escopo</span><span style={styles.detailValue}>{selectedUser.GroupScope}</span></div>
                            <div style={styles.detailItem}><span style={styles.detailLabel}>Gerenciado Por</span><span style={styles.detailValue}>{selectedUser.Manager}</span></div>
                            <div style={styles.detailItemFull}><span style={styles.detailLabel}>Descrição</span><span style={styles.detailValue}>{selectedUser.Description}</span></div>
                          </div>
                        </>
                      )}

                      <p style={{...styles.sectionLabel, marginTop: '20px'}}>Metadados de Diretório</p>
                      <div style={styles.detailGrid}>
                        <div style={styles.detailItemFull}><span style={styles.detailLabel}>Nome Canônico (DN)</span><span style={styles.detailValueMicro}>{selectedUser.DN}</span></div>
                        <div style={styles.detailItem}><span style={styles.detailLabel}>Classe do Objeto</span><span style={styles.detailValue}>{selectedUser.ObjectClass}</span></div>
                        <div style={styles.detailItem}><span style={styles.detailLabel}>Criado em</span><span style={styles.detailValue}>{selectedUser.Created}</span></div>
                        <div style={styles.detailItem}><span style={styles.detailLabel}>Modificado em</span><span style={styles.detailValue}>{selectedUser.Modified}</span></div>
                        <div style={styles.detailItem}><span style={styles.detailLabel}>USN (Original)</span><span style={styles.detailValue}>{selectedUser.USNCreated}</span></div>
                        <div style={styles.detailItem}><span style={styles.detailLabel}>USN (Atual)</span><span style={styles.detailValue}>{selectedUser.USNChanged}</span></div>
                      </div>
                    </>
                  )}

                  {/* ABA DE RELACIONAMENTOS */}
                  {/* ABA DE RELACIONAMENTOS COM GESTÃO DINÂMICA (+/-) */}
                  {innerTab === 'grupos' && (
                    <div>
                      {/* Formulário de Adicionar ao Grupo (Apenas para Usuários e Computadores) */}
                      {!isGroup && (
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '15px' }}>
                          <input
                            type="text"
                            placeholder="Digite o nome do grupo no AD..."
                            value={newGroupName}
                            onChange={(e) => setNewGroupName(e.target.value)}
                            style={styles.inputReset}
                          />
                          <button
                            type="button"
                            onClick={handleAddGroup}
                            disabled={groupLoading}
                            style={{ ...styles.actionBtnSuccess, padding: '0 18px' }}
                          >
                            {groupLoading ? '...' : '+ Adicionar'}
                          </button>
                        </div>
                      )}

                      <div style={styles.listContainer}>
                        {isGroup ? (
                          selectedUser.Members?.length === 0 ? (
                            <p style={styles.hintText}>Nenhum membro neste grupo.</p>
                          ) : (
                            selectedUser.Members.map((m, i) => (
                              <div key={i} style={styles.listItem}>
                                <User size={14} style={{ marginRight: '8px', color: COLORS.muted }} /> {m}
                              </div>
                            ))
                          )
                        ) : selectedUser.MemberOf?.length === 0 ? (
                          <p style={styles.hintText}>Nenhum relacionamento encontrado.</p>
                        ) : (
                          selectedUser.MemberOf.map((g, i) => (
                            <div key={i} style={{ ...styles.listItem, justifyContent: 'space-between' }}>
                              <div style={{ display: 'flex', alignItems: 'center' }}>
                                <Users size={14} style={{ marginRight: '8px', color: COLORS.gold }} /> {g}
                              </div>
                              <button
                                type="button"
                                onClick={() => handleRemoveGroup(g)}
                                style={styles.removeGroupBtn}
                                title="Remover usuário deste grupo"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}

                  {/* ABA DE SEGURANÇA / DIAGNÓSTICO */}
                  {innerTab === 'seguranca' && (
                    <div style={styles.actionSection}>
                      
                      <div style={styles.actionsGrid}>
                        {isUser && <button onClick={() => setModalEditOpen(true)} style={styles.gridBtn}><Settings size={14} /> Editar Perfil</button>}
                        {(isUser || isComputer) && <button onClick={openMoveModal} style={styles.gridBtn}><Server size={14} /> Mover OU</button>}
                        {isComputer && <button onClick={fetchLocalGroups} disabled={loadingGroups} style={styles.gridBtn}>{loadingGroups ? 'Processando...' : <><Users size={14}/> Grupos Locais</>}</button>}
                        {isComputer && <button onClick={fetchSecurityKeys} style={{...styles.gridBtn, borderColor: COLORS.success, color: COLORS.success, fontWeight: 'bold'}}><Unlock size={14}/> LAPS & BitLocker</button>}
                        
                        {/* NOVO BOTÃO: ATIVAR WINRM VIA DCOM */}
                        {isComputer && (
                          <button 
                            onClick={handleEnableWinRM} 
                            disabled={winrmLoading}
                            style={{ ...styles.gridBtn, borderColor: '#38BDF8', color: '#38BDF8', fontWeight: 'bold' }}
                          >
                            {winrmLoading ? 'Enviando...' : <><Activity size={14}/> Forçar WinRM</>}
                          </button>
                        )}
                        
                        {/* BOTÃO: NOTIFICAR USUÁRIO ATIVO */}
                        {isComputer && (
                          <button 
                            onClick={() => {
                              setNotifyMessage('Favor salvar seus trabalhos em aberto. Sua máquina passará por uma rápida manutenção do Suporte TI em 5 minutos.');
                              setModalNotifyOpen(true);
                            }} 
                            style={{ ...styles.gridBtn, borderColor: COLORS.gold, color: COLORS.gold, fontWeight: 'bold' }}
                          >
                            <Bell size={14} /> Notificar Usuário
                          </button>
                        )}
                      </div>

                      <p style={styles.sectionLabel}>Telemetria e Diagnósticos</p>
                      <div style={styles.actionsGrid}>
                        {isComputer && <button onClick={() => runDiagnostic('ping')} style={styles.diagBtn}><Activity size={14}/> Ping ICMP</button>}
                        {isComputer && <button onClick={() => runDiagnostic('wmi')} style={styles.diagBtn}><BarChart size={14}/> WMI Hardware</button>}
                        {isUser && <button onClick={() => runDiagnostic('splunk')} style={{...styles.diagBtn, borderColor: COLORS.warning, color: COLORS.warning}}><Search size={14}/> Rastrear Bloqueio</button>}
                      </div>

                      {isComputer && localGroups && (
                         <div style={styles.groupsBox}>
                           <p style={styles.sectionLabel}>Mapeamento de Administradores Locais</p>
                           {localGroups.length === 0 ? <p style={styles.hintText}>Lista vazia.</p> : localGroups.map((g, i) => <div key={i} style={styles.groupItem}><strong>{g.Grupo}:</strong> {g.Membro}</div>)}
                         </div>
                      )}

                      {isUser && (
                        <div style={styles.dangerZone}>
                          {selectedUser.LockedOut && <button onClick={handleUnlock} style={styles.actionBtnWarning}><Unlock size={14}/> Desbloquear Conta</button>}
                          {selectedUser.Enabled && (
                            <div style={styles.resetContainer}>
                              <p style={styles.sectionLabel}>Redefinir Credenciais</p>
                              
                              <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                                <input 
                                  type="text" 
                                  placeholder="Digite ou gere uma senha..." 
                                  value={newPassword} 
                                  onChange={(e) => setNewPassword(e.target.value)} 
                                  style={styles.inputReset} 
                                />
                                <button 
                                  type="button" 
                                  onClick={gerarSenhaAleatoria} 
                                  style={styles.generateBtn}
                                >
                                  Gerar
                                </button>
                              </div>

                              <label style={styles.toggleRow}>
                                <input
                                  type="checkbox"
                                  checked={unlockAccount}
                                  onChange={(e) => setUnlockAccount(e.target.checked)}
                                  style={styles.checkbox}
                                />
                                <div>
                                  <div style={styles.toggleLabel}>Desbloquear conta simultaneamente</div>
                                  <div style={styles.toggleSub}>Zera o LockoutTime no Active Directory</div>
                                </div>
                              </label>

                              <label style={styles.toggleRow}>
                                <input
                                  type="checkbox"
                                  checked={forceChange}
                                  onChange={(e) => setForceChange(e.target.checked)}
                                  style={styles.checkbox}
                                />
                                <div>
                                  <div style={styles.toggleLabel}>Exigir alteração no próximo logon</div>
                                  <div style={styles.toggleSub}>Desmarque se a senha não puder ser expirada na hora</div>
                                </div>
                              </label>

                              {/* Botões de Ação: Aplicar + Copiar Resumo */}
                              <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
                                <button 
                                  onClick={handleResetPassword} 
                                  disabled={resetLoading} 
                                  style={{ ...styles.actionBtnSuccess, flex: 2, padding: '12px' }}
                                >
                                  {resetLoading ? 'Aguarde...' : 'Aplicar Credenciais'}
                                </button>
                                <button
                                  type="button"
                                  onClick={copiarResumoCredenciais}
                                  style={{ ...styles.generateBtn, flex: 1, backgroundColor: COLORS.frame, border: `1px solid ${COLORS.gold}`, color: COLORS.gold, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                                  title="Copiar texto formatado com usuário e senha"
                                >
                                  <Copy size={15} /> Copiar
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ABA VETORH */}
                  {innerTab === 'vetorh' && (
                     <div style={styles.actionSection}>
                       {vetorhLoading ? <p style={styles.hintText}>Sincronizando com SQL Server...</p> : (
                         <>
                           <div style={styles.resetContainer}>
                             <p style={styles.sectionLabel}>Tipo de Colaborador</p>
                             <div style={{ ...styles.inputReset, backgroundColor: 'transparent', color: COLORS.muted, cursor: 'not-allowed', border: `1px solid ${COLORS.border}` }}>
                               {vetorhData.tipcol === 1 ? '1 - Próprio' : '2 - Terceiro'} (Detectado Automaticamente)
                             </div>
                           </div>
                           <div style={styles.resetContainer}>
                             <p style={styles.sectionLabel}>Nível de Acesso Técnico</p>
                             <select value={vetorhData.techacc} onChange={(e) => setVetorhData({...vetorhData, techacc: e.target.value})} style={styles.modalSelect}>
                               <option value="NTU">NTU (Básico)</option>
                               <option value="LTU">LTU (Leitura)</option>
                               <option value="ETU">ETU (Edição)</option>
                             </select>
                           </div>
                           <button onClick={saveVetorh} style={{...styles.gridBtn, backgroundColor: COLORS.success, color: COLORS.bg, fontWeight: 'bold'}}><Database size={14}/> Aplicar Procedure</button>
                         </>
                       )}
                     </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* ================= ABA 2: LOTE ================= */}
        {activeTab === 'bulk' && (
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>Transação em Lote</h3>
            <p style={styles.hintText}>Insira os identificadores divididos por vírgula.</p>
            <textarea value={bulkInput} onChange={(e) => setBulkInput(e.target.value)} placeholder="Identificadores..." style={styles.textArea} />
            <div style={styles.bulkActionsGrid}>
              <button disabled={bulkLoading} onClick={() => handleBulkAction('unlock')} style={styles.bulkBtnUnlock}><Unlock size={14}/> Desbloquear</button>
              <button disabled={bulkLoading} onClick={() => handleBulkAction('enable')} style={styles.bulkBtnEnable}><CheckCircle size={14}/> Ativar</button>
              <button disabled={bulkLoading} onClick={() => handleBulkAction('disable')} style={styles.bulkBtnDisable}><Ban size={14}/> Desativar</button>
            </div>
            {bulkResult && (
              <div style={styles.bulkResultBox}>
                <p style={{ color: COLORS.success, fontWeight: 'bold', margin: '0 0 10px 0' }}>Concluídos: {bulkResult.success_count} de {bulkResult.total}</p>
                {bulkResult.errors.length > 0 && (
                  <div>
                    <p style={{ color: COLORS.danger, fontSize: '13px', margin: '0 0 5px 0' }}>Exceções:</p>
                    <ul style={{ color: COLORS.danger, fontSize: '12px', paddingLeft: '20px', margin: 0 }}>
                      {bulkResult.errors.map((err, idx) => <li key={idx}><strong>{err.user}:</strong> {err.error}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ================= ABA 3: COMPARADOR ================= */}
        {activeTab === 'compare' && (
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>Matriz de Permissões</h3>
            <p style={styles.hintText}>Avalie divergências em políticas de segurança.</p>
            <div style={styles.searchWrapper}>
              <input type="text" placeholder="Logins..." value={compareInput} onChange={(e) => setCompareInput(e.target.value)} style={styles.input} />
              <button onClick={handleCompare} disabled={compareLoading} style={styles.searchBtn}>{compareLoading ? <div style={styles.spinner}></div> : <Scale size={18} />}</button>
            </div>

            {compareResult && (
              <div style={{ marginTop: '20px' }}>
                <div style={styles.commonBox}>
                  <p style={{ color: COLORS.success, fontWeight: 'bold', margin: '0 0 10px 0', display: 'flex', alignItems: 'center', gap: '5px' }}><CheckCircle size={16}/> Conformidade (Em Comum)</p>
                  <div style={styles.listContainer}>
                    {compareResult.common_groups.map((g, idx) => <div key={idx} style={{...styles.listItem, color: COLORS.success, borderColor: COLORS.success}}>{g}</div>)}
                  </div>
                </div>

                <p style={{ color: COLORS.warning, fontWeight: 'bold', margin: '20px 0 10px 0' }}>Divergências (Exclusivos)</p>
                <div style={styles.diffGrid}>
                  {Object.keys(compareResult.users).map((username, idx) => (
                    <div key={idx} style={styles.diffCard}>
                      <p style={{ margin: '0 0 5px 0', color: COLORS.gold, fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '5px' }}><User size={14}/> {username.toUpperCase()}</p>
                      <div style={styles.listContainer}>
                        {compareResult.users[username].ExclusiveGroups.map((g, i) => <div key={i} style={{...styles.listItem, padding: '6px', fontSize: '11px'}}>{g}</div>)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================= ABA 4: IMPRESSORAS ================= */}
        {activeTab === 'printers' && (
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>Gestor de Spool</h3>
            <p style={styles.hintText}>Mapeamento de recursos em servidores físicos.</p>
            <form onSubmit={handleSearchPrinters} style={styles.searchForm}>
              <div style={styles.searchWrapper}>
                <input type="text" placeholder="Servidor (Ex: PTU-PRN-01)" value={printServer} onChange={(e) => setPrintServer(e.target.value)} style={styles.input} />
                <button type="submit" disabled={printersLoading} style={styles.searchBtn}>{printersLoading ? <div style={styles.spinner}></div> : <Search size={20} />}</button>
              </div>
            </form>

            {printersList.length > 0 && (
              <>
                <div style={{ display: 'flex', gap: '10px', marginBottom: '15px', flexWrap: 'wrap' }}>
                  <button onClick={restartSpooler} style={{...styles.actionBtnWarning, flex: 1, display: 'flex', justifyContent: 'center', gap: '8px'}}>
                    <RefreshCw size={16}/> Spooler
                  </button>
                  <button onClick={() => runPrintDiagnostic('ping')} style={{...styles.diagBtn, flex: 1, display: 'flex', justifyContent: 'center', gap: '8px'}}>
                    <Activity size={16}/> Ping
                  </button>
                  <button onClick={() => runPrintDiagnostic('wmi')} style={{...styles.diagBtn, flex: 1, display: 'flex', justifyContent: 'center', gap: '8px'}}>
                    <BarChart size={16}/> WMI
                  </button>
                </div>
                <div style={styles.listGrid}>
                  {printersList.map((prn, idx) => (
                    <div key={idx} style={{...styles.card, padding: '15px', cursor: 'default'}}>
                      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '15px'}}>
                        <div>
                          <h4 style={{...styles.cardTitle, fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px'}}>
                            <Printer size={16}/> {prn.Name}
                          </h4>
                          <p style={styles.miniCardSubtitle}>{prn.DriverName}</p>
                        </div>
                        <span style={{backgroundColor: COLORS.cell, padding: '4px 8px', borderRadius: '4px', fontSize: '12px', color: COLORS.gold, border: `1px solid ${COLORS.border}`, fontWeight: 'bold'}}>
                          {prn.JobCount} docs
                        </span>
                      </div>
                      
                      <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '20px'}}>
                         <div style={styles.detailItem}>
                           <span style={styles.detailLabel}>Porta / IP</span>
                           <span style={styles.detailValue}>{prn.PortName || 'N/A'}</span>
                         </div>
                         <div style={styles.detailItem}>
                           <span style={styles.detailLabel}>Status Físico</span>
                           <span style={styles.detailValue}>{prn.PrinterStatus?.Value || prn.PrinterStatus || 'Normal'}</span>
                         </div>
                         <div style={styles.detailItemFull}>
                           <span style={styles.detailLabel}>Localização</span>
                           <span style={styles.detailValue}>{prn.Location || 'Não informada no AD'}</span>
                         </div>
                      </div>

                      <div style={{display: 'flex', gap: '10px'}}>
                        <button onClick={() => pingPrinter(prn.Name, prn.PortName)} style={{...styles.gridBtn, flex: 1, borderColor: '#38BDF8', color: '#38BDF8'}}>
                          <Activity size={14}/> Ping
                        </button>
                        <button onClick={() => clearQueue(prn.Name)} style={{...styles.gridBtn, flex: 1, borderColor: COLORS.warning, color: COLORS.warning}}>
                          <Trash2 size={14}/> Limpar Fila
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
        {/* ================= ABA 5: VETORH DIRETO (SQL SERVER) ================= */}
        {activeTab === 'vetorh_direct' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* CARD 1: CONSULTA RÁPIDA POR MATRÍCULA */}
            <div style={styles.card}>
              <h3 style={styles.cardTitle}>Consulta SQL (Vetorh)</h3>
              <p style={styles.hintText}>Insira uma ou várias matrículas (separadas por vírgula).</p>
              
              <form onSubmit={handleVetorhDirectSearch} style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                <input
                  type="text"
                  placeholder="Ex: 10452, 10453, 10454..."
                  value={vetorhSearchMat}
                  onChange={(e) => setVetorhSearchMat(e.target.value)}
                  style={styles.inputReset}
                />
                <button type="submit" disabled={vetorhSearchLoading} style={{ ...styles.actionBtnSuccess, padding: '0 20px' }}>
                  {vetorhSearchLoading ? '...' : <Search size={16} />}
                </button>
              </form>

              {vetorhSearchResult && Array.isArray(vetorhSearchResult) && (
                <div style={{ marginTop: '15px' }}>
                  {vetorhSearchResult.length === 0 ? (
                    <div style={styles.errorBox}><AlertTriangle size={16} /> Nenhuma matrícula correspondente localizada.</div>
                  ) : vetorhSearchResult.length === 1 ? (
                    
                    /* DOSSIÊ INDIVIDUAL (1 ÚNICA MATRÍCULA) */
                    <div style={styles.resetContainer}>
                      <p style={{...styles.sectionLabel, marginBottom: '15px'}}>Dossiê do Colaborador (Vetorh)</p>
                      <div style={styles.detailGrid}>
                        <div style={styles.detailItemFull}>
                          <span style={styles.detailLabel}>Nome Completo (nomfun)</span>
                          <span style={styles.detailValue}>{vetorhSearchResult[0].nomfun}</span>
                        </div>
                        <div style={styles.detailItem}>
                          <span style={styles.detailLabel}>AD Display (addisname)</span>
                          <span style={styles.detailValue}>{vetorhSearchResult[0].usu_addisname || 'N/A'}</span>
                        </div>
                        <div style={styles.detailItem}>
                          <span style={styles.detailLabel}>Network ID</span>
                          <span style={styles.detailValue}>{vetorhSearchResult[0].networkid || 'N/A'}</span>
                        </div>
                        <div style={styles.detailItem}>
                          <span style={styles.detailLabel}>Situação (sitafa)</span>
                          <span style={{
                            ...styles.detailValue, 
                            color: vetorhSearchResult[0].sitafa.includes('Trabalhando') ? COLORS.success : 
                                   vetorhSearchResult[0].sitafa.includes('Demitido') ? COLORS.danger : COLORS.warning
                          }}>
                            {vetorhSearchResult[0].sitafa}
                          </span>
                        </div>
                        <div style={styles.detailItem}>
                          <span style={styles.detailLabel}>Acesso (techacc)</span>
                          <span style={{...styles.detailValue, color: COLORS.gold, fontWeight: 'bold'}}>{vetorhSearchResult[0].techacc}</span>
                        </div>
                        <div style={styles.detailItem}>
                          <span style={styles.detailLabel}>Empresa (numemp)</span>
                          <span style={styles.detailValue}>{vetorhSearchResult[0].numemp}</span>
                        </div>
                        <div style={styles.detailItem}>
                          <span style={styles.detailLabel}>Tipo (tipcol)</span>
                          <span style={styles.detailValue}>{vetorhSearchResult[0].tipcol === 1 ? '1 - Próprio' : '2 - Terceiro'}</span>
                        </div>
                        <div style={styles.detailItemFull}>
                          <span style={styles.detailLabel}>IGA DIGID</span>
                          <span style={{...styles.detailValue, fontFamily: 'monospace'}}>{vetorhSearchResult[0].igadigid}</span>
                        </div>
                        <div style={styles.detailItemFull}>
                          <span style={styles.detailLabel}>E-mails (Comercial / Particular)</span>
                          <span style={styles.detailValue}>
                            {vetorhSearchResult[0].emacom || 'S/N'} <strong style={{color: COLORS.muted}}> | </strong> {vetorhSearchResult[0].emapar || 'S/N'}
                          </span>
                        </div>
                      </div>
                    </div>

                  ) : (

                    /* TABELA DINÂMICA (MÚLTIPLAS MATRÍCULAS) */
                    <div style={{...styles.resetContainer, overflowX: 'auto'}}>
                      <p style={{...styles.sectionLabel, marginBottom: '15px'}}>Pesquisa em Lote ({vetorhSearchResult.length} resultados)</p>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left', color: COLORS.text }}>
                         <thead>
                            <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                               <th style={{ padding: '8px', color: COLORS.muted }}>Matrícula</th>
                               <th style={{ padding: '8px', color: COLORS.muted }}>Nome</th>
                               <th style={{ padding: '8px', color: COLORS.muted }}>SITAFA</th>
                               <th style={{ padding: '8px', color: COLORS.muted }}>Acesso</th>
                               <th style={{ padding: '8px', color: COLORS.muted }}>IGA DIGID</th>
                            </tr>
                         </thead>
                         <tbody>
                            {vetorhSearchResult.map((row, idx) => (
                                <tr key={idx} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                                   <td style={{ padding: '8px' }}>{row.numcad}</td>
                                   <td style={{ padding: '8px', fontWeight: 'bold' }}>{row.nomfun}</td>
                                   <td style={{ padding: '8px', color: row.sitafa.includes('Trabalhando') ? COLORS.success : row.sitafa.includes('Demitido') ? COLORS.danger : COLORS.warning }}>{row.sitafa}</td>
                                   <td style={{ padding: '8px', color: COLORS.gold, fontWeight: 'bold' }}>{row.techacc}</td>
                                   <td style={{ padding: '8px', fontFamily: 'monospace' }}>{row.igadigid || 'N/A'}</td>
                                </tr>
                            ))}
                         </tbody>
                      </table>
                    </div>

                  )}
                </div>
              )}
            </div>

            {/* CARD 2: EXECUÇÃO DA PROCEDURE (SIMPLES OU EM LOTE) */}
            <div style={styles.card}>
              <h3 style={styles.cardTitle}>Executar SP_IntTITechAcc</h3>
              <p style={styles.hintText}>Insira uma ou várias matrículas. O sistema detectará o tipo do colaborador automaticamente.</p>
              
              <textarea
                value={vetorhDirectInput}
                onChange={(e) => setVetorhDirectInput(e.target.value)}
                placeholder="Matrículas (Ex: 10452, 10453, 10454)..."
                style={styles.textArea}
              />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '10px', marginTop: '15px' }}>
                <div>
                  <span style={styles.detailLabel}>Definir Novo Nível de Acesso</span>
                  <select
                    value={vetorhDirectTechacc}
                    onChange={(e) => setVetorhDirectTechacc(e.target.value)}
                    style={styles.modalSelect}
                  >
                    <option value="NTU">NTU (Básico)</option>
                    <option value="LTU">LTU (Leitura)</option>
                    <option value="ETU">ETU (Edição)</option>
                  </select>
                </div>
              </div>

              <button
                type="button"
                onClick={handleVetorhDirectUpdate}
                disabled={vetorhDirectLoading}
                style={{
                  ...styles.actionBtnSuccess,
                  width: '100%',
                  padding: '14px',
                  marginTop: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  fontSize: '14px'
                }}
              >
                <Database size={18} />
                {vetorhDirectLoading ? 'Processando Lote...' : 'Aplicar Procedure SQL'}
              </button>

              {/* BOX DE RETORNO DO SQL SERVER (MANTIDO INTACTO) */}
              {vetorhDirectResult && (
                <div style={styles.bulkResultBox}>
                  <p style={{ color: COLORS.success, fontWeight: 'bold', margin: '0 0 10px 0' }}>
                    Sucesso: {vetorhDirectResult.success_count} registro(s) atualizado(s)
                  </p>
                  {vetorhDirectResult.errors?.length > 0 && (
                    <div>
                      <p style={{ color: COLORS.danger, fontSize: '13px', margin: '0 0 5px 0' }}>Erros SQL:</p>
                      <ul style={{ color: COLORS.danger, fontSize: '12px', paddingLeft: '20px', margin: 0 }}>
                        {vetorhDirectResult.errors.map((err, idx) => (
                          <li key={idx}><strong>Matrícula {err.matricula}:</strong> {err.error}[cite: 5]</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>

          </div>
        )}
      </div>

      {/* MODAL: VISOR LAPS E BITLOCKER */}
      {modalSecurityOpen && (
        <div style={styles.modalOverlay}>
          <div style={{...styles.modalContent, maxWidth: '500px'}}>
            <h3 style={{color: COLORS.gold, margin: '0 0 15px 0', display: 'flex', alignItems: 'center', gap: '8px'}}><Unlock size={18}/> Chaves de Criptografia</h3>
            {securityLoading ? (
              <div style={{display: 'flex', alignItems: 'center', gap: '10px', color: COLORS.gold, padding: '20px 0'}}>
                <div style={styles.spinner}></div> <p>Descriptografando atributos de segurança do AD...</p>
              </div>
            ) : (
              <>
                <div style={styles.resetContainer}>
                  <p style={styles.sectionLabel}>Senha Local Admin (LAPS)</p>
                  <input type="text" readOnly value={securityData.laps} style={{...styles.modalInput, color: COLORS.success, fontWeight: 'bold', fontSize: '18px', letterSpacing: '1px', textAlign: 'center'}} />
                </div>
                
                <div style={{...styles.resetContainer, marginTop: '15px'}}>
                  <p style={styles.sectionLabel}>Recovery Keys (BitLocker)</p>
                  {securityData.bitlocker.length === 0 ? (
                     <p style={styles.hintText}>Nenhuma chave de recuperação armazenada no diretório para este ativo.</p>
                  ) : (
                     <div style={{maxHeight: '180px', overflowY: 'auto'}}>
                       {securityData.bitlocker.map((bk, idx) => (
                         <div key={idx} style={{backgroundColor: COLORS.bg, padding: '12px', borderRadius: '4px', marginBottom: '10px', border: `1px solid ${COLORS.border}`}}>
                           <p style={{margin: '0 0 6px 0', fontSize: '11px', color: COLORS.muted}}>Backup gerado em: {bk.date}</p>
                           <p style={{margin: 0, fontSize: '14px', color: COLORS.text, fontFamily: 'monospace', userSelect: 'all'}}>{bk.key}</p>
                         </div>
                       ))}
                     </div>
                  )}
                </div>
              </>
            )}
            <div style={styles.modalActions}>
              <button onClick={() => setModalSecurityOpen(false)} style={styles.modalCancelBtn}>Fechar Visor Seguro</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMAÇÃO COM TRAVA FAT-FINGER */}
      {confirmConfig.isOpen && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <h3 style={{color: COLORS.gold, margin: '0 0 10px 0', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px'}}><AlertTriangle size={18}/> {confirmConfig.title}</h3>
            <p style={{color: COLORS.text, fontSize: '13px', marginBottom: '15px', lineHeight: '1.5'}}>{confirmConfig.message}</p>
            
            {requireSecurityWord && (
              <input
                type="text"
                placeholder='Digite CONFIRMAR em maiúsculas'
                value={confirmInputText}
                onChange={(e) => setConfirmInputText(e.target.value)}
                style={{ ...styles.modalInput, borderColor: COLORS.danger, marginBottom: '15px', textTransform: 'uppercase' }}
              />
            )}

            <div style={styles.modalActions}>
              <button onClick={() => setConfirmConfig({...confirmConfig, isOpen: false})} style={styles.modalCancelBtn}>Cancelar</button>
              <button 
                onClick={handleConfirmAction} 
                disabled={requireSecurityWord && confirmInputText !== 'CONFIRMAR'}
                style={{
                  ...styles.modalSaveBtn,
                  opacity: (requireSecurityWord && confirmInputText !== 'CONFIRMAR') ? 0.4 : 1,
                  backgroundColor: requireSecurityWord ? COLORS.danger : COLORS.gold
                }}
              >
                Prosseguir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: TERMINAL */}
      {terminalOpen && (
        <div style={styles.modalOverlay}>
          <div style={{...styles.modalContent, maxWidth: '600px', backgroundColor: '#000', border: `1px solid ${COLORS.border}`}}>
            <h3 style={{color: COLORS.gold, margin: '0 0 10px 0', fontFamily: 'monospace', fontSize: '14px'}}>{terminalTitle}</h3>
            <textarea readOnly value={terminalContent} style={{ width: '100%', height: '300px', backgroundColor: '#000', color: '#00FF00', fontFamily: 'monospace', fontSize: '12px', border: 'none', outline: 'none', resize: 'none' }} />
            <div style={styles.modalActions}>
              <button disabled={terminalLoading} onClick={() => setTerminalOpen(false)} style={{...styles.modalSaveBtn, display: 'flex', justifyContent: 'center', alignItems: 'center'}}>{terminalLoading ? 'Aguarde' : 'Encerrar Sessão'}</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: VISOR DE HISTÓRICO DE AUDITORIA (LOGS) */}
      {modalAuditOpen && (
        <div style={styles.modalOverlay}>
          <div style={{...styles.modalContent, maxWidth: '550px'}}>
            <h3 style={{color: COLORS.gold, margin: '0 0 15px 0', display: 'flex', alignItems: 'center', gap: '8px'}}>
              <FileText size={18}/> Auditoria de Plantão (Últimos 20)
            </h3>
            {auditLoading ? (
              <div style={{color: COLORS.gold, padding: '20px', textAlign: 'center'}}>Carregando log de eventos...</div>
            ) : (
              <div style={{maxHeight: '300px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px'}}>
                {auditLogs.length === 0 ? (
                  <p style={styles.hintText}>Nenhum log registrado ainda.</p>
                ) : (
                  auditLogs.map((linha, idx) => (
                    <div key={idx} style={{ backgroundColor: COLORS.cell, padding: '10px', borderRadius: '4px', border: `1px solid ${COLORS.border}`, fontSize: '11px', fontFamily: 'monospace', color: COLORS.text }}>
                      {linha}
                    </div>
                  ))
                )}
              </div>
            )}
            <div style={styles.modalActions}>
              <button onClick={() => setModalAuditOpen(false)} style={styles.modalCancelBtn}>Fechar Histórico</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: EDITAR PERFIL */}
      {modalEditOpen && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <h3 style={{color: COLORS.gold, margin: '0 0 15px 0'}}>Atualização de Registro</h3>
            <input type="text" value={editData.title} onChange={e => setEditData({...editData, title: e.target.value})} style={styles.modalInput} placeholder="Cargo" />
            <input type="text" value={editData.department} onChange={e => setEditData({...editData, department: e.target.value})} style={{...styles.modalInput, marginTop: '10px'}} placeholder="Departamento" />
            <input type="text" value={editData.telephone} onChange={e => setEditData({...editData, telephone: e.target.value})} style={{...styles.modalInput, marginTop: '10px'}} placeholder="Telefone" />
            <div style={styles.modalActions}>
              <button onClick={() => setModalEditOpen(false)} style={styles.modalCancelBtn}>Cancelar</button>
              <button onClick={handleSaveProfile} style={styles.modalSaveBtn}>Aplicar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: MOVER OU */}
      {modalMoveOpen && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <h3 style={{color: COLORS.gold, margin: '0 0 15px 0'}}>Movimentação Estrutural</h3>
            {loadingOus ? <p style={{color: COLORS.gold, fontSize: '13px'}}>Carregando estrutura...</p> : (
              <select value={selectedOu} onChange={(e) => setSelectedOu(e.target.value)} style={styles.modalSelect}>
                <option value="">-- Destino Organizacional --</option>
                {ouList.map((ou, idx) => <option key={idx} value={ou.dn}>{ou.ou}</option>)}
              </select>
            )}
            <div style={styles.modalActions}>
              <button onClick={() => setModalMoveOpen(false)} style={styles.modalCancelBtn}>Cancelar</button>
              <button onClick={handleMoveOu} style={styles.modalSaveBtn}>Movimentar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: NOTIFICAR USUÁRIO ATIVO NO DESKTOP */}
      {modalNotifyOpen && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <h3 style={{ color: COLORS.gold, margin: '0 0 10px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Bell size={18} /> Notificar Usuário Ativo
            </h3>
            <p style={{ color: COLORS.muted, fontSize: '12px', marginBottom: '15px' }}>
              Envia uma janela de pop-up na área de trabalho da máquina remota.
            </p>
            
            <textarea
              value={notifyMessage}
              onChange={(e) => setNotifyMessage(e.target.value)}
              placeholder="Digite o aviso para o usuário..."
              style={styles.textArea}
            />

            <div style={styles.modalActions}>
              <button 
                onClick={() => setModalNotifyOpen(false)} 
                disabled={notifyLoading} 
                style={styles.modalCancelBtn}
              >
                Cancelar
              </button>
              <button 
                onClick={handleSendNotification} 
                disabled={notifyLoading} 
                style={{ ...styles.modalSaveBtn, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              >
                {notifyLoading ? 'Enviando...' : 'Disparar Alerta'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ESTILOS CORPORATIVOS
const COLORS = { bg: '#0B111E', frame: '#161F32', cell: '#121824', border: '#24324D', gold: '#C5A059', text: '#F8FAFC', muted: '#94A3B8', success: '#10B981', warning: '#F59E0B', danger: '#EF4444' };

const styles = {
  container: { backgroundColor: COLORS.bg, minHeight: '100vh', fontFamily: '-apple-system, sans-serif', paddingBottom: '30px', color: COLORS.text },
  header: { backgroundColor: COLORS.frame, padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${COLORS.border}` },
  headerTitle: { display: 'flex', alignItems: 'center', gap: '10px' }, logoBadge: { backgroundColor: COLORS.gold, color: COLORS.bg, width: '28px', height: '28px', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' },
  logoutBtn: { background: 'none', border: 'none', color: COLORS.muted, cursor: 'pointer', display: 'flex', alignItems: 'center' },
  tabContainer: { display: 'flex', backgroundColor: COLORS.frame, borderBottom: `1px solid ${COLORS.border}`, overflowX: 'auto' },
  tabActive: { flex: 1, padding: '15px', backgroundColor: COLORS.bg, color: COLORS.gold, borderStyle: 'solid', borderWidth: '0 0 2px 0', borderColor: COLORS.gold, fontWeight: '600', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', whiteSpace: 'nowrap' },
  tabInactive: { flex: 1, padding: '15px', backgroundColor: 'transparent', color: COLORS.muted, borderStyle: 'solid', borderWidth: '0 0 2px 0', borderColor: 'transparent', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', whiteSpace: 'nowrap', cursor: 'pointer' },
  content: { padding: '20px', maxWidth: '600px', margin: '0 auto' },
  searchForm: { marginBottom: '20px' }, searchWrapper: { display: 'flex', gap: '8px', backgroundColor: COLORS.cell, borderRadius: '6px', padding: '6px', border: `1px solid ${COLORS.border}` },
  input: { flex: 1, backgroundColor: 'transparent', border: 'none', color: COLORS.text, fontSize: '14px', padding: '10px', outline: 'none' }, searchBtn: { backgroundColor: COLORS.gold, color: COLORS.bg, border: 'none', borderRadius: '4px', width: '42px', height: '42px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' },
  spinner: { width: '18px', height: '18px', border: `2px solid rgba(0,0,0,0.2)`, borderTop: `2px solid ${COLORS.bg}`, borderRadius: '50%', animation: 'spin 1s linear infinite' },
  errorBox: { backgroundColor: 'rgba(239, 68, 68, 0.1)', color: COLORS.danger, padding: '12px', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px', border: `1px solid ${COLORS.danger}` },
  
  listGrid: { display: 'flex', flexDirection: 'column', gap: '10px' }, miniCard: { backgroundColor: COLORS.frame, padding: '15px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '15px', border: `1px solid ${COLORS.border}`, cursor: 'pointer' },
  miniAvatar: { width: '36px', height: '36px', borderRadius: '18px', backgroundColor: COLORS.cell, color: COLORS.gold, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  miniCardTitle: { margin: '0 0 2px 0', fontSize: '14px', color: COLORS.text, fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }, miniCardSubtitle: { margin: '0 0 2px 0', fontSize: '12px', color: COLORS.muted },
  backBtn: { backgroundColor: 'transparent', color: COLORS.gold, border: 'none', cursor: 'pointer', marginBottom: '15px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px', padding: 0 },
  
  card: { backgroundColor: COLORS.frame, borderRadius: '8px', padding: '20px', border: `1px solid ${COLORS.border}`, boxShadow: '0 4px 15px rgba(0,0,0,0.3)' },
  cardHeader: { display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '15px' }, avatar: { width: '44px', height: '44px', borderRadius: '6px', backgroundColor: COLORS.cell, color: COLORS.gold, border: `1px solid ${COLORS.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  cardTitle: { color: COLORS.gold, margin: '0 0 4px 0', fontSize: '16px', fontWeight: 'bold' }, cardSubtitle: { color: COLORS.muted, margin: 0, fontSize: '12px' },
  statusRow: { display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' },
  tagActive: { backgroundColor: 'transparent', color: COLORS.success, padding: '6px 12px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', border: `1px solid ${COLORS.success}`, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' },
  tagInactive: { backgroundColor: 'transparent', color: COLORS.danger, padding: '6px 12px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', border: `1px solid ${COLORS.danger}`, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' },
  tagUnlocked: { backgroundColor: 'transparent', color: COLORS.success, padding: '6px 12px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', border: `1px solid ${COLORS.success}`, display: 'flex', alignItems: 'center', gap: '4px' }, tagLocked: { backgroundColor: 'transparent', color: COLORS.warning, padding: '6px 12px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', border: `1px solid ${COLORS.warning}`, display: 'flex', alignItems: 'center', gap: '4px' },
  tagType: { backgroundColor: COLORS.cell, color: COLORS.muted, padding: '6px 12px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', border: `1px solid ${COLORS.border}` },
  
  innerTabs: { display: 'flex', borderBottom: `1px solid ${COLORS.border}`, marginBottom: '15px', overflowX: 'auto' },
  innerTabActive: { backgroundColor: 'transparent', color: COLORS.gold, borderStyle: 'solid', borderWidth: '0 0 2px 0', borderColor: COLORS.gold, padding: '10px 15px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', whiteSpace: 'nowrap' }, innerTabInactive: { backgroundColor: 'transparent', color: COLORS.muted, borderStyle: 'solid', borderWidth: '0 0 2px 0', borderColor: 'transparent', padding: '10px 15px', fontSize: '12px', cursor: 'pointer', whiteSpace: 'nowrap' },
  innerContent: { minHeight: '150px' }, detailGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' },
  detailItem: { backgroundColor: COLORS.cell, padding: '10px', borderRadius: '6px', border: `1px solid ${COLORS.border}` }, detailItemFull: { gridColumn: '1 / -1', backgroundColor: COLORS.cell, padding: '10px', borderRadius: '6px', border: `1px solid ${COLORS.border}` },
  detailLabel: { display: 'block', color: COLORS.muted, fontSize: '10px', textTransform: 'uppercase', marginBottom: '4px', fontWeight: 'bold', letterSpacing: '0.5px' }, detailValue: { color: COLORS.text, fontSize: '12px', fontWeight: '500' }, detailValueMicro: { color: COLORS.muted, fontSize: '11px', wordBreak: 'break-all' },
  listContainer: { display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '300px', overflowY: 'auto' }, listItem: { backgroundColor: COLORS.cell, padding: '10px', borderRadius: '6px', fontSize: '12px', color: COLORS.text, border: `1px solid ${COLORS.border}`, display: 'flex', alignItems: 'center' },
  
  actionSection: { display: 'flex', flexDirection: 'column', gap: '15px' }, actionsGrid: { display: 'flex', gap: '10px', flexWrap: 'wrap' },
  gridBtn: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', backgroundColor: COLORS.cell, color: COLORS.text, border: `1px solid ${COLORS.border}`, padding: '10px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', minWidth: '120px' },
  diagBtn: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', backgroundColor: 'transparent', color: '#38BDF8', border: `1px solid #38BDF8`, padding: '10px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', minWidth: '120px', fontWeight: '600' },
  dangerZone: { borderTop: `1px solid ${COLORS.border}`, paddingTop: '15px', display: 'flex', flexDirection: 'column', gap: '15px' }, actionBtnWarning: { backgroundColor: 'transparent', color: COLORS.warning, border: `1px solid ${COLORS.warning}`, padding: '12px', borderRadius: '6px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' },
  resetContainer: { backgroundColor: COLORS.cell, padding: '15px', borderRadius: '6px', border: `1px solid ${COLORS.border}` }, sectionLabel: { color: COLORS.gold, fontSize: '11px', margin: '0 0 10px 0', textTransform: 'uppercase', fontWeight: 'bold', letterSpacing: '0.5px' }, resetRow: { display: 'flex', gap: '10px' },
  inputReset: { flex: 1, backgroundColor: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text, padding: '10px', borderRadius: '4px', outline: 'none', fontSize: '13px' }, actionBtnSuccess: { backgroundColor: COLORS.success, color: COLORS.bg, border: 'none', padding: '0 15px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', fontSize: '12px' },
  
  generateBtn: {
    backgroundColor: COLORS.border,
    color: COLORS.text,
    border: 'none',
    borderRadius: '4px',
    padding: '0 12px',
    fontWeight: 'bold',
    fontSize: '12px',
    cursor: 'pointer'
  },
  toggleRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    marginBottom: '12px',
    cursor: 'pointer',
    userSelect: 'none'
  },
  checkbox: {
    width: '16px',
    height: '16px',
    accentColor: COLORS.gold,
    marginTop: '2px',
    cursor: 'pointer'
  },
  toggleLabel: {
    color: COLORS.text,
    fontSize: '12px',
    fontWeight: '600'
  },
  toggleSub: {
    color: COLORS.muted,
    fontSize: '11px',
    marginTop: '2px'
  },
  headerIconBtn: {
    background: 'none',
    border: 'none',
    color: COLORS.gold,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    padding: '4px'
  },
  recentChip: {
    backgroundColor: COLORS.cell,
    color: COLORS.text,
    border: `1px solid ${COLORS.border}`,
    borderRadius: '12px',
    padding: '4px 10px',
    fontSize: '11px',
    cursor: 'pointer',
    fontWeight: '500'
  },
  clearRecentBtn: {
    background: 'none',
    border: 'none',
    color: COLORS.danger,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '4px 6px',
    borderRadius: '50%',
    marginLeft: '2px',
    opacity: 0.85
  },
  groupsBox: { backgroundColor: COLORS.cell, padding: '12px', borderRadius: '6px', border: `1px solid ${COLORS.border}` }, groupItem: { color: COLORS.muted, fontSize: '12px', marginBottom: '6px', borderBottom: `1px solid ${COLORS.border}`, paddingBottom: '6px' }, hintText: { color: COLORS.muted, fontSize: '12px' },
  
  textArea: { width: '100%', height: '120px', backgroundColor: COLORS.cell, border: `1px solid ${COLORS.border}`, color: COLORS.text, padding: '12px', borderRadius: '6px', boxSizing: 'border-box', marginTop: '10px', resize: 'vertical', outline: 'none', fontSize: '13px' },
  bulkActionsGrid: { display: 'flex', gap: '10px', marginTop: '15px' }, bulkBtnUnlock: { flex: 1, backgroundColor: 'transparent', color: COLORS.warning, border: `1px solid ${COLORS.warning}`, padding: '10px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }, bulkBtnEnable: { flex: 1, backgroundColor: 'transparent', color: COLORS.success, border: `1px solid ${COLORS.success}`, padding: '10px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }, bulkBtnDisable: { flex: 1, backgroundColor: 'transparent', color: COLORS.danger, border: `1px solid ${COLORS.danger}`, padding: '10px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' },
  bulkResultBox: { backgroundColor: COLORS.cell, padding: '15px', borderRadius: '6px', marginTop: '20px', border: `1px solid ${COLORS.border}` },
  
  commonBox: { backgroundColor: 'transparent', padding: '15px', borderRadius: '6px', border: `1px solid ${COLORS.success}` },
  diffGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '15px' }, diffCard: { backgroundColor: COLORS.cell, padding: '15px', borderRadius: '6px', border: `1px solid ${COLORS.gold}`, display: 'flex', flexDirection: 'column' },
  
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(11, 17, 30, 0.95)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' },
  modalContent: { backgroundColor: COLORS.frame, padding: '25px', borderRadius: '8px', width: '100%', maxWidth: '400px', border: `1px solid ${COLORS.border}` },
  modalInput: { width: '100%', backgroundColor: COLORS.cell, border: `1px solid ${COLORS.border}`, color: COLORS.text, padding: '10px', borderRadius: '4px', boxSizing: 'border-box', outline: 'none', fontSize: '13px' },
  modalSelect: { width: '100%', backgroundColor: COLORS.cell, border: `1px solid ${COLORS.border}`, color: COLORS.text, padding: '10px', borderRadius: '4px', marginTop: '10px', outline: 'none', fontSize: '13px' },
  modalActions: { display: 'flex', gap: '10px', marginTop: '25px' }, modalCancelBtn: { flex: 1, padding: '10px', backgroundColor: 'transparent', color: COLORS.text, border: `1px solid ${COLORS.border}`, borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }, modalSaveBtn: { flex: 1, padding: '10px', backgroundColor: COLORS.gold, color: COLORS.bg, border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px' },
  
  // ADICIONAR DENTRO DE 'const styles = { ... }'
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px',
    marginBottom: '20px'
  },
  summaryCard: {
    backgroundColor: COLORS.frame,
    border: `1px solid ${COLORS.border}`,
    borderRadius: '8px',
    padding: '15px',
    display: 'flex',
    flexDirection: 'column'
  },
  summaryLabel: {
    color: COLORS.muted,
    fontSize: '11px',
    fontWeight: 'bold',
    textTransform: 'uppercase'
  },
  summaryValueWarning: {
    color: COLORS.warning,
    fontSize: '28px',
    fontWeight: 'bold',
    margin: '10px 0 2px 0'
  },
  summaryValueGold: {
    color: COLORS.gold,
    fontSize: '28px',
    fontWeight: 'bold',
    margin: '10px 0 2px 0'
  },
  summarySub: {
    color: COLORS.muted,
    fontSize: '11px'
  },
  removeGroupBtn: {
    background: 'none',
    border: 'none',
    color: COLORS.danger,
    cursor: 'pointer',
    padding: '4px',
    display: 'flex',
    alignItems: 'center'
  }

};

const styleSheet = document.createElement("style"); styleSheet.innerText = `@keyframes spin { 100% { transform: rotate(360deg); } }`; document.head.appendChild(styleSheet);
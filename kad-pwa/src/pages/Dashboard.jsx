import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import toast, { Toaster } from 'react-hot-toast';
import { 
  User, Monitor, Users, Search, Layers, Scale, Database, Printer, 
  CheckCircle, Ban, Unlock, Activity, BarChart, ArrowRight, ArrowLeft, 
  Tag, LogOut, Settings, Server, Trash2, RefreshCw, AlertTriangle,
  FileText, Copy, Clock, X, Bell,
  Download, ListChecks
} from 'lucide-react';

// --- COMPONENTE DA ÁRVORE DE OUs ---
const TreeNode = ({ node, selectedDn, onSelect, level = 0 }) => {
  const [isOpen, setIsOpen] = React.useState(level < 1); // Deixa apenas a Raiz aberta por padrão
  const hasChildren = node.children && node.children.length > 0;
  const isSelected = selectedDn === node.dn;

  // Paleta fixa local para garantir segurança de renderização
  const cGold = '#C5A059';
  const cText = '#F8FAFC';
  const cBg = '#0B111E';

  return (
    <div style={{ paddingLeft: level === 0 ? '0px' : '20px', marginTop: '4px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '6px 8px',
          backgroundColor: isSelected ? cGold : 'transparent',
          color: isSelected ? cBg : cText,
          borderRadius: '4px',
          cursor: 'pointer',
          border: isSelected ? `1px solid ${cGold}` : '1px solid transparent',
        }}
        onClick={() => onSelect(node.dn)}
      >
        {hasChildren ? (
          <span
            onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
            style={{ cursor: 'pointer', marginRight: '8px', width: '12px', display: 'inline-block', textAlign: 'center', fontWeight: 'bold' }}
          >
            {isOpen ? '▼' : '▶'}
          </span>
        ) : (
          <span style={{ width: '12px', marginRight: '8px', display: 'inline-block', textAlign: 'center', color: '#94A3B8' }}>•</span>
        )}
        <span style={{ fontSize: '13px', whiteSpace: 'nowrap', fontWeight: level === 0 ? 'bold' : '500' }}>
          {node.isRoot ? `🌐 ${node.ou}` : `📁 ${node.ou}`}
        </span>
      </div>

      {isOpen && hasChildren && (
        <div style={{ borderLeft: `1px dashed #24324D`, marginLeft: '6px', paddingLeft: '2px' }}>
          {node.children.map((child, idx) => (
            <TreeNode key={idx} node={child} selectedDn={selectedDn} onSelect={onSelect} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  );
};

// --- COMPONENTE CUSTOMIZADO: TOGGLE SWITCH ---
const ToggleSwitch = ({ checked, onChange, label, subLabel }) => (
  <div 
    style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '14px', cursor: 'pointer', userSelect: 'none' }} 
    onClick={() => onChange(!checked)}
  >
    <div style={{
      position: 'relative',
      width: '40px',
      height: '20px',
      backgroundColor: checked ? '#C5A059' : '#121824',
      borderRadius: '20px',
      border: `1px solid ${checked ? '#C5A059' : '#24324D'}`,
      marginTop: '2px',
      transition: 'all 0.3s ease'
    }}>
      <div style={{
        position: 'absolute',
        top: '1px',
        left: checked ? '21px' : '1px',
        width: '16px',
        height: '16px',
        backgroundColor: checked ? '#F8FAFC' : '#94A3B8',
        borderRadius: '50%',
        transition: 'left 0.3s ease',
        boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
      }} />
    </div>
    <div>
      <div style={{ color: '#F8FAFC', fontSize: '12px', fontWeight: '600' }}>{label}</div>
      {subLabel && <div style={{ color: '#94A3B8', fontSize: '11px', marginTop: '3px', lineHeight: '1.3' }}>{subLabel}</div>}
    </div>
  </div>
);

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('single'); 
  // ESTADO NOVO: Filtro da aba Grupos
  const [groupSearchTerm, setGroupSearchTerm] = useState('');
  const [innerTab, setInnerTab] = useState('geral');

  // ESTADOS NOVOS: Editor de Atributos
  const [attrData, setAttrData] = useState(null);
  const [attrLoading, setAttrLoading] = useState(false);
  const [attrSearch, setAttrSearch] = useState('');

  // ESTADOS NOVOS: Clonagem de Perfil
  const [cloneSource, setCloneSource] = useState('');
  const [cloneLoading, setCloneLoading] = useState(false);

  // ESTADOS NOVOS: Carrinho de Seleção (Lote Inteligente)
  const [cart, setCart] = useState([]);

  const toggleCartItem = (item, e) => {
    e.stopPropagation(); // Impede que o clique no checkbox abra o perfil do usuário
    setCart(prev => {
      const exists = prev.find(i => i.SamAccountName === item.SamAccountName);
      if (exists) return prev.filter(i => i.SamAccountName !== item.SamAccountName);
      return [...prev, item];
    });
  };

  const isItemInCart = (item) => cart.some(i => i.SamAccountName === item.SamAccountName);

  // Estados: Busca AD
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [xupervisorData, setXupervisorData] = useState(null);
  const [xupervisorLoading, setXupervisorLoading] = useState(false);
  const [xupervisorError, setXupervisorError] = useState('');
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
  const [editData, setEditData] = useState({
    title: '',
    department: '',
    telephone: '',
    description: '',
    manager_dn: '',
    manager_label: ''
  });
  const [managerSearch, setManagerSearch] = useState('');
  const [managerResults, setManagerResults] = useState([]);
  const [managerLoading, setManagerLoading] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [managedComputers, setManagedComputers] = useState([]);
  const [managedComputersLoading, setManagedComputersLoading] = useState(false);
  const [managedComputersError, setManagedComputersError] = useState('');
  const [modalMoveOpen, setModalMoveOpen] = useState(false);
  const [treeData, setTreeData] = useState([]);
  const [selectedOu, setSelectedOu] = useState('');
  const [loadingOus, setLoadingOus] = useState(false);

  // Modal de Confirmação Customizado
  const [confirmDialog, setConfirmDialog] = useState({ 
    isOpen: false, 
    title: '', 
    message: '', 
    onConfirm: null 
  });

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

  // ESTADOS NOVOS: Kill Process
  const [killPid, setKillPid] = useState('');
  const [killLoading, setKillLoading] = useState(false);

  // Estados: Lote & Comparador
  const [bulkInput, setBulkInput] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);
  const [computerBulkInput, setComputerBulkInput] = useState('');
  const [computerBulkLoading, setComputerBulkLoading] = useState(false);
  const [computerBulkResult, setComputerBulkResult] = useState(null);
  const [computerBulkView, setComputerBulkView] = useState('list');
  const [unifiedBulkInput, setUnifiedBulkInput] = useState('');
  const [unifiedBulkLoading, setUnifiedBulkLoading] = useState(false);
  const [unifiedBulkProgress, setUnifiedBulkProgress] = useState({
    completed: 0,
    total: 0
  });
  const [unifiedBulkRunning, setUnifiedBulkRunning] = useState(false);
  const [unifiedBulkItems, setUnifiedBulkItems] = useState([]);
  const [unifiedBulkValidated, setUnifiedBulkValidated] = useState(false);
  const [unifiedBulkView, setUnifiedBulkView] = useState('list');
  const [unifiedBulkFilter, setUnifiedBulkFilter] = useState('all');
  const [unifiedBulkResult, setUnifiedBulkResult] = useState(null);
  const [bulkResultFilter, setBulkResultFilter] = useState('all');
  const [unifiedBulkHistoryOpen, setUnifiedBulkHistoryOpen] = useState(false);
  const [unifiedBulkHistory, setUnifiedBulkHistory] = useState(() => {
    try {
      const saved = localStorage.getItem(
        '@kad_unified_bulk_history'
      );

      return saved
        ? JSON.parse(saved)
        : [];
    } catch {
      return [];
    }
  });
  const [compareInput, setCompareInput] = useState('');
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareResult, setCompareResult] = useState(null);
  const [compareSearch, setCompareSearch] = useState('');

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

  const handleKillProcess = async () => {
    if (!killPid.trim() || isNaN(killPid)) return toast.error('Digite um PID numérico válido.');
    setKillLoading(true);
    try {
      const res = await api.post(`/computers/${selectedUser.SamAccountName}/kill/${killPid.trim()}`);
      toast.success(res.data.message);
      setKillPid('');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao encerrar processo.');
    } finally {
      setKillLoading(false);
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

    let stopped = false;
    let checking = false;
    let nextRetryAt = 0;
    const interval = setInterval(async () => {
      if (stopped || checking || Date.now() < nextRetryAt) return;
      checking = true;
      for (const username of monitoredUsers) {
        if (stopped) break;
        try {
          const res = await api.get(`/users/${username}`);
          nextRetryAt = 0;
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
          if (err.response?.status === 401) {
            stopped = true;
            clearInterval(interval);
            toast.error('Sessao expirada. Entre novamente no KAD.');
            handleLogout();
            break;
          }
          if (err.response?.status === 502 || !err.response) {
            nextRetryAt = Date.now() + 300000;
            console.warn(`Consulta de ${username} pausada por 5 minutos.`);
            break;
          }
          console.error(`Falha ao checar status de ${username}`);
        }
      }
      checking = false;
    }, 30000); // 30000 ms = checa a cada 30 segundos

    return () => {
      stopped = true;
      clearInterval(interval);
    };
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
    const texto = `🔒 Atualização de Credenciais - KAD Mobile\n\n` +
      `👤 Usuário: ${selectedUser.SamAccountName}\n` +
      `🔑 Senha Provisória: ${newPassword}\n` +
      `ℹ️ Status: Conta desbloqueada.\n` +
      `⚠️ Nota: ${forceChange ? 'Será exigida a alteração da senha no primeiro logon.' : 'Senha configurada em modo contínuo.'}`;
    
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

  const [xupervisorStatus, setXupervisorStatus] = useState(null);
  const [xupervisorStatusLoading, setXupervisorStatusLoading] = useState(false);
  const [xupervisorStatusError, setXupervisorStatusError] = useState('');

  const [searchPerformance, setSearchPerformance] = useState(null);
  const [searchPerformanceLoading, setSearchPerformanceLoading] = useState(false);
  const [searchPerformanceError, setSearchPerformanceError] = useState('');

  const [searchCache, setSearchCache] = useState(null);
  const [searchCacheLoading, setSearchCacheLoading] = useState(false);
  const [searchCacheError, setSearchCacheError] = useState('');

  const formatPerformanceMs = (value) => {
    const number = Number(value || 0);

    if (!Number.isFinite(number)) {
      return '0 ms';
    }

    if (number >= 1000) {
      return `${(number / 1000).toFixed(2)} s`;
    }

    return `${number.toFixed(0)} ms`;
  };

  const fetchSearchPerformance = async (showFeedback = false) => {
    setSearchPerformanceLoading(true);
    setSearchPerformanceError('');

    try {
      const response = await api.get(
        '/dashboard/search-performance',
        {
          params: {
            limit: 2000,
            slow_limit: 10
          }
        }
      );

      setSearchPerformance(
        response.data || null
      );

      if (showFeedback) {
        toast.success(
          'Indicadores de busca atualizados.'
        );
      }

    } catch (err) {
      if (err.response?.status === 401) {
        toast.error(
          'Sessao expirada. Entre novamente no KAD.'
        );

        handleLogout();
      } else {
        setSearchPerformanceError(
          'Nao foi possivel carregar os indicadores.'
        );

        if (showFeedback) {
          toast.error(
            'Falha ao atualizar os indicadores.'
          );
        }
      }

    } finally {
      setSearchPerformanceLoading(false);
    }
  };

  const fetchSearchCache = async () => {
    setSearchCacheLoading(true);
    setSearchCacheError('');

    try {
      const response = await api.get(
        '/dashboard/search-cache'
      );

      setSearchCache(
        response.data || null
      );

      return response.data || null;

    } catch (err) {
      if (err.response?.status === 401) {
        toast.error(
          'Sessao expirada. Entre novamente no KAD.'
        );

        handleLogout();
      } else {
        setSearchCacheError(
          'Nao foi possivel carregar as metricas do cache.'
        );
      }

      return null;

    } finally {
      setSearchCacheLoading(false);
    }
  };

  const fetchSearchIndicators = async (
    showFeedback = false
  ) => {
    await Promise.all([
      fetchSearchPerformance(false),
      fetchSearchCache()
    ]);

    if (showFeedback) {
      toast.success(
        'Indicadores de busca e cache atualizados.'
      );
    }
  };

  const getSearchCacheHitRate = () => {
    const hits = Number(
      searchCache?.metrics?.hits || 0
    );

    const misses = Number(
      searchCache?.metrics?.misses || 0
    );

    const total = hits + misses;

    if (total <= 0) {
      return 0;
    }

    return Number(
      (
        hits
        / total
        * 100
      ).toFixed(2)
    );
  };

  const formatXupervisorDate = (value) => {
    if (!value) {
      return 'Nao informado';
    }

    const text = String(value).trim();

    const parts = text.split(' ');

    if (parts.length !== 2) {
      return text;
    }

    const dateParts = parts[0].split('-');

    if (dateParts.length !== 3) {
      return text;
    }

    return (
      dateParts[2]
      + '/'
      + dateParts[1]
      + '/'
      + dateParts[0]
      + ' '
      + parts[1]
    );
  };

  const isXupervisorPublicationStale = (value) => {
    if (!value) {
      return true;
    }

    const parsed = new Date(
      String(value).replace(' ', 'T')
    );

    if (Number.isNaN(parsed.getTime())) {
      return true;
    }

    const ageMilliseconds =
      Date.now() - parsed.getTime();

    const limitMilliseconds =
      24 * 60 * 60 * 1000;

    return ageMilliseconds > limitMilliseconds;
  };

  const fetchXupervisorStatus = async (showFeedback = false) => {
    setXupervisorStatusLoading(true);
    setXupervisorStatusError('');

    try {
      const response = await api.get(
        '/dashboard/xupervisor-status'
      );

      setXupervisorStatus(
        response.data || null
      );

      if (showFeedback) {
        toast.success(
          'Status do Xupervisor atualizado.'
        );
      }
    } catch (err) {
      if (err.response?.status === 401) {
        toast.error(
          'Sessao expirada. Entre novamente no KAD.'
        );

        handleLogout();
      } else {
        setXupervisorStatusError(
          'Nao foi possivel carregar o status do Xupervisor.'
        );

        if (showFeedback) {
          toast.error(
            'Falha ao atualizar o status do Xupervisor.'
          );
        }
      }
    } finally {
      setXupervisorStatusLoading(false);
    }
  };

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

  // Carrega os resumos automaticamente ao abrir o Dashboard.
  React.useEffect(() => {
    fetchSummary();
    fetchXupervisorStatus(false);
    fetchSearchIndicators(false);
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

  const handleCloneGroups = async () => {
    if (!cloneSource.trim()) return toast.error('Digite o login do usuário de origem (espelho).');
    if (cloneSource.trim().toLowerCase() === selectedUser.SamAccountName.toLowerCase()) {
      return toast.error('O usuário de origem não pode ser igual ao de destino.');
    }
    
    showConfirm(
      'Espelhamento de Acessos',
      `Você está prestes a copiar todos os grupos de "${cloneSource.toUpperCase()}" para "${selectedUser.SamAccountName.toUpperCase()}". Esta ação adicionará o usuário aos grupos, mas não removerá os atuais. Deseja prosseguir?`,
      async () => {
        setCloneLoading(true);
        try {
          const res = await api.post(`/users/${selectedUser.SamAccountName}/clone-groups`, {
            source_user: cloneSource.trim()
          });
          toast.success(res.data.message);
          setCloneSource('');
          handleSearch(); // Recarrega os dados para mostrar os novos grupos na tela!
        } catch (err) {
          toast.error(err.response?.data?.detail || 'Erro ao clonar grupos.');
        } finally {
          setCloneLoading(false);
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
      const response = await api.get(`/users/${encodeURIComponent(searchTerm.trim().replace(/:/g, '-'))}`);
      setSearchResults(response.data.data);
      if (response.data.data.length === 1) selectUserForDetail(response.data.data[0]);
    } catch (err) { setError(err.response?.status === 404 ? 'Nenhum resultado localizado no diretório.' : 'Erro de conexão.'); } 
    finally { setLoading(false); }
  };

  const fetchManagedComputers = async (user) => {
    if (
      !user ||
      user.Type !== 'User' ||
      !user.SamAccountName
    ) {
      setManagedComputers([]);
      setManagedComputersError('');
      setManagedComputersLoading(false);
      return;
    }

    setManagedComputers([]);
    setManagedComputersError('');
    setManagedComputersLoading(true);

    try {
      const response = await api.get(
        `/users/${encodeURIComponent(
          user.SamAccountName
        )}/managed-computers`
      );

      const equipamentos = Array.isArray(
        response.data?.data
      )
        ? response.data.data
        : [];

      setManagedComputers(equipamentos);
    } catch (err) {
      setManagedComputers([]);

      if (err.response?.status === 401) {
        setManagedComputersError(
          'Sessão expirada. Entre novamente no KAD.'
        );
      } else {
        setManagedComputersError(
          err.response?.data?.detail ||
          'Falha ao consultar equipamentos gerenciados.'
        );
      }
    } finally {
      setManagedComputersLoading(false);
    }
  };

  const openManagedComputer = async (computer) => {
    const computerName = (
      computer.SamAccountName ||
      computer.DisplayName ||
      ''
    ).replace(/\$$/, '');

    if (!computerName) {
      toast.error('Nome do computador nao identificado.');
      return;
    }

    const toastId = toast.loading(
      `Carregando ${computerName}...`
    );

    try {
      const response = await api.get(
        `/users/${encodeURIComponent(computerName)}`
      );

      const resultados = Array.isArray(response.data?.data)
        ? response.data.data
        : [];

      const computador = resultados.find(
        item =>
          item.Type === 'Computer' &&
          (
            item.SamAccountName
              ?.replace(/\$$/, '')
              .toLowerCase() === computerName.toLowerCase()
          )
      ) || resultados.find(
        item => item.Type === 'Computer'
      );

      if (!computador) {
        throw new Error(
          'Computador nao retornado pela consulta.'
        );
      }

      setSearchTerm(computerName);
      setSearchResults([computador]);
      setInnerTab('geral');
      selectUserForDetail(computador);

      toast.success(
        `Computador ${computerName} carregado.`,
        { id: toastId }
      );
    } catch (err) {
      toast.error(
        err.response?.data?.detail ||
        'Falha ao abrir os detalhes do computador.',
        { id: toastId }
      );
    }
  };

  const fetchXupervisorData = async (computer) => {
    if (
      !computer ||
      computer.Type !== 'Computer'
    ) {
      setXupervisorData(null);
      setXupervisorError('');
      setXupervisorLoading(false);
      return;
    }

    const hostname = (
      computer.SamAccountName ||
      computer.DisplayName ||
      computer.DNS ||
      ''
    )
      .trim()
      .split('.')[0]
      .replace(/\$$/, '');

    if (!hostname) {
      setXupervisorData(null);
      setXupervisorError(
        'Hostname do computador não identificado.'
      );
      setXupervisorLoading(false);
      return;
    }

    setXupervisorData(null);
    setXupervisorError('');
    setXupervisorLoading(true);

    try {
      const response = await api.get(
        `/computers/${encodeURIComponent(
          hostname
        )}/xupervisor`
      );

      setXupervisorData(
        response.data?.data || null
      );
    } catch (err) {
      setXupervisorData(null);

      if (err.response?.status === 404) {
        setXupervisorError(
          'Computador não localizado no inventário Xupervisor.'
        );
      } else if (err.response?.status === 401) {
        setXupervisorError(
          'Sessão expirada. Entre novamente no KAD.'
        );
      } else {
        setXupervisorError(
          err.response?.data?.detail ||
          'Falha ao consultar o inventário Xupervisor.'
        );
      }
    } finally {
      setXupervisorLoading(false);
    }
  };

  const selectUserForDetail = (user) => {
    setSelectedUser(user);
    setXupervisorData(null);
    setXupervisorError('');

    if (user?.Type === 'Computer') {
      fetchXupervisorData(user);
    } else {
      setXupervisorLoading(false);
    }
    setEditData({
      title: user.Title === 'N/A' ? '' : (user.Title || ''),
      department: user.Department === 'N/A' ? '' : (user.Department || ''),
      telephone: user.TelephoneNumber === 'N/A' ? '' : (user.TelephoneNumber || ''),
      description: user.Description === 'N/A' ? '' : (user.Description || ''),
      manager_dn: user.ManagerDN || '',
      manager_label: user.Manager === 'N/A' ? '' : (user.Manager || '')
    });
    setManagerSearch('');
    setManagerResults([]);

    setManagedComputers([]);
    setManagedComputersError('');

    if (user.Type === 'User') {
      fetchManagedComputers(user);
    } else {
      setManagedComputersLoading(false);
    }
    
    // Zera os dados enquanto busca
    setVetorhData({ tipcol: 1, techacc: 'NTU', sitafa: 'Carregando...', igadigid: 'Carregando...' });
    setGroupSearchTerm(''); // <-- ADICIONE ESTA LINHA AQUI
    setAttrData(null); // <--- Zera os atributos antigos
    setAttrSearch(''); // <--- Limpa a barra de pesquisa de atributos
    setCloneSource('');

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

  const parseUnifiedBulkInput = () => {
    return Array.from(
      new Set(
        unifiedBulkInput
          .replace(/\r/g, '\n')
          .split(',')
          .flatMap(item => item.split(';'))
          .flatMap(item => item.split('\n'))
          .map(item => item.trim())
          .filter(Boolean)
      )
    );
  };

  const validateUnifiedBulkIdentifier = async identifier => {
    try {
      const normalizedSearch = identifier.replace(
        /:/g,
        '-'
      );

      const response = await api.get(
        `/users/${encodeURIComponent(normalizedSearch)}`
      );

      const results = Array.isArray(
        response.data?.data
      )
        ? response.data.data
        : [];

      const normalizedIdentifier = identifier
        .replace(/\$$/, '')
        .toLowerCase();

      const exactResult = results.find(item => {
        const sam = String(
          item.SamAccountName || ''
        )
          .replace(/\$$/, '')
          .toLowerCase();

        const employeeId = String(
          item.EmployeeID || ''
        ).toLowerCase();

        const dns = String(
          item.DNS || ''
        )
          .split('.')[0]
          .toLowerCase();

        return (
          sam === normalizedIdentifier
          || employeeId === normalizedIdentifier
          || dns === normalizedIdentifier
        );
      });

      const selectedResult =
        exactResult
        || (
          results.length === 1
            ? results[0]
            : null
        );

      if (!selectedResult) {
        return {
          input: identifier,
          id: identifier,
          displayName:
            results.length > 1
              ? 'Resultado ambiguo'
              : 'Nao localizado',
          type: 'Invalid',
          valid: false,
          selected: false,
          enabled: null,
          locked: false,
          message:
            results.length > 1
              ? `${results.length} objetos encontrados. Refine o identificador.`
              : 'Objeto nao localizado.'
        };
      }

      const type =
        selectedResult.Type === 'Computer'
          ? 'Computer'
          : selectedResult.Type === 'User'
            ? 'User'
            : 'Invalid';

      const valid =
        type === 'User'
        || type === 'Computer';

      const matricula =
        type === 'User' && selectedResult.EmployeeID
          ? String(selectedResult.EmployeeID).trim()
          : '';

      let igaDigid = '';

      if (matricula && /^\d+$/.test(matricula)) {
        try {
          const vetorhResponse = await api.get(
            `/vetorh/${matricula}`
          );

          const igaValue = String(
            vetorhResponse.data?.igadigid || ''
          ).trim();

          igaDigid = igaValue && igaValue !== 'N/A'
            ? igaValue
            : '';
        } catch (vetorhError) {
          igaDigid = '';
        }
      }


      return {
        input: identifier,
        id: String(
          selectedResult.SamAccountName
          || identifier
        ),
        displayName:
          selectedResult.DisplayName
          || selectedResult.SamAccountName
          || identifier,
        type,
        valid,
        selected: valid,
        enabled:
          typeof selectedResult.Enabled === 'boolean'
            ? selectedResult.Enabled
            : null,
        locked: Boolean(
          selectedResult.LockedOut
        ),
        ultimoLogon:
          selectedResult.LastLogon
          && selectedResult.LastLogon !== 'N/A'
            ? String(selectedResult.LastLogon)
            : '',
        matricula,
        igaDigid,
        gerenciadoPor:
          type === 'Computer'
          && selectedResult.Manager
          && selectedResult.Manager !== 'N/A'
            ? String(selectedResult.Manager)
            : '',
        message: valid
          ? 'Objeto validado.'
          : 'Tipo de objeto nao suportado.'
      };
    } catch (err) {
      return {
        input: identifier,
        id: identifier,
        displayName: 'Nao localizado',
        type: 'Invalid',
        valid: false,
        selected: false,
        enabled: null,
        locked: false,
        message:
          err.response?.status === 404
            ? 'Objeto nao localizado no diretorio.'
            : 'Falha ao consultar o objeto.'
      };
    }
  };

  const validateUnifiedBulkWithLimit = async (
    identifiers,
    concurrency = 4
  ) => {
    const results = new Array(
      identifiers.length
    );

    let nextIndex = 0;
    let completedCount = 0;

    const worker = async () => {
      while (true) {
        const currentIndex = nextIndex;
        nextIndex += 1;

        if (currentIndex >= identifiers.length) {
          return;
        }

        try {
          results[currentIndex] =
            await validateUnifiedBulkIdentifier(
              identifiers[currentIndex]
            );
        } finally {
          completedCount += 1;

          setUnifiedBulkProgress({
            completed: completedCount,
            total: identifiers.length
          });
        }
      }
    };

    const workerCount = Math.min(
      concurrency,
      identifiers.length
    );

    const workers = Array.from(
      {
        length: workerCount
      },
      () => worker()
    );

    await Promise.all(
      workers
    );

    return results;
  };

  const deduplicateUnifiedBulkItems = items => {
    const seenObjects = new Set();
    const uniqueItems = [];

    items.forEach(item => {
      if (!item.valid) {
        uniqueItems.push(item);
        return;
      }

      const canonicalId = String(
        item.id || item.input || ''
      ).toUpperCase();

      const canonicalKey =
        item.type
        + ':'
        + canonicalId;

      if (seenObjects.has(canonicalKey)) {
        return;
      }

      seenObjects.add(canonicalKey);
      uniqueItems.push(item);
    });

    return uniqueItems;
  };

  const handleUnifiedBulkValidation = async event => {
    if (event) {
      event.preventDefault();
    }

    const identifiers = parseUnifiedBulkInput();

    if (identifiers.length === 0) {
      toast.error(
        'Insira pelo menos um identificador.'
      );

      return;
    }

    setUnifiedBulkLoading(true);
    setUnifiedBulkValidated(false);
    setUnifiedBulkItems([]);
    setUnifiedBulkResult(null);
    setUnifiedBulkProgress({
      completed: 0,
      total: identifiers.length
    });

    try {
      const validatedItems =
        await validateUnifiedBulkWithLimit(
          identifiers,
          4
        );

      const uniqueValidatedItems =
        deduplicateUnifiedBulkItems(
          validatedItems
        );

      const duplicateCount =
        validatedItems.length
        - uniqueValidatedItems.length;

      setUnifiedBulkItems(
        uniqueValidatedItems
      );

      setUnifiedBulkValidated(true);

      setUnifiedBulkView(
        uniqueValidatedItems.length === 1
          ? 'detail'
          : 'list'
      );

      const validCount = uniqueValidatedItems.filter(
        item => item.valid
      ).length;

      if (duplicateCount > 0) {
        toast.success(
          `${duplicateCount} objeto(s) duplicado(s) removido(s).`
        );
      }

      if (validCount > 0) {
        toast.success(
          `${validCount} objeto(s) validado(s).`
        );
      } else {
        toast.error(
          'Nenhum objeto valido foi localizado.'
        );
      }
    } catch (err) {
      toast.error(
        'Falha durante a validacao dos objetos.'
      );

      setUnifiedBulkValidated(false);
      setUnifiedBulkItems([]);
    } finally {
      setUnifiedBulkLoading(false);
    }
  };

  const toggleUnifiedBulkItem = index => {
    setUnifiedBulkItems(previous =>
      previous.map((item, itemIndex) =>
        itemIndex === index && item.valid
          ? {
              ...item,
              selected: !item.selected
            }
          : item
      )
    );
  };

  const removeUnifiedBulkItem = index => {
    setUnifiedBulkItems(previous =>
      previous.filter(
        (item, itemIndex) =>
          itemIndex !== index
      )
    );
  };

  const revalidateFailedUnifiedBulkItems = async () => {
    const failedItems = unifiedBulkItems.filter(
      item => !item.valid
    );

    if (failedItems.length === 0) {
      toast.success(
        'Nao existem falhas para revalidar.'
      );

      return;
    }

    const failedIdentifiers = failedItems.map(
      item => item.input
    );

    setUnifiedBulkLoading(true);
    setUnifiedBulkResult(null);
    setUnifiedBulkProgress({
      completed: 0,
      total: failedIdentifiers.length
    });

    try {
      const revalidatedItems =
        await validateUnifiedBulkWithLimit(
          failedIdentifiers,
          4
        );

      let revalidatedIndex = 0;

      const mergedItems = unifiedBulkItems.map(
        item => {
          if (item.valid) {
            return item;
          }

          const replacement =
            revalidatedItems[revalidatedIndex];

          revalidatedIndex += 1;

          return replacement || item;
        }
      );

      const uniqueMergedItems =
        deduplicateUnifiedBulkItems(
          mergedItems
        );

      const duplicateCount =
        mergedItems.length
        - uniqueMergedItems.length;

      setUnifiedBulkItems(
        uniqueMergedItems
      );

      setUnifiedBulkValidated(true);

      const recoveredCount = revalidatedItems.filter(
        item => item.valid
      ).length;

      const remainingFailures = uniqueMergedItems.filter(
        item => !item.valid
      ).length;

      if (duplicateCount > 0) {
        toast.success(
          `${duplicateCount} objeto(s) duplicado(s) removido(s).`
        );
      }

      if (recoveredCount > 0) {
        toast.success(
          `${recoveredCount} objeto(s) recuperado(s).`
        );
      } else {
        toast.error(
          'Nenhum objeto com falha foi recuperado.'
        );
      }

      if (remainingFailures === 0) {
        toast.success(
          'Todos os objetos foram validados.'
        );
      }
    } catch (err) {
      toast.error(
        'Falha ao revalidar os objetos.'
      );
    } finally {
      setUnifiedBulkLoading(false);
    }
  };

  const clearUnifiedBulk = () => {
    setUnifiedBulkInput('');
    setUnifiedBulkLoading(false);
    setUnifiedBulkItems([]);
    setUnifiedBulkValidated(false);
    setUnifiedBulkView('list');
    setUnifiedBulkFilter('all');
    setUnifiedBulkResult(null);
    setUnifiedBulkProgress({
      completed: 0,
      total: 0
    });

    setBulkResult(null);
    setComputerBulkResult(null);

    toast.success(
      'Lote limpo.'
    );
  };

  const saveUnifiedBulkHistory = (
    action,
    results
  ) => {
    const success = results.filter(
      item => item.success
    ).length;

    const entry = {
      id:
        Date.now()
        + '-'
        + Math.random().toString(16).slice(2),
      dateTime:
        new Date().toLocaleString('pt-BR'),
      action,
      total: results.length,
      success,
      failed:
        results.length - success,
      users: results.filter(
        item => item.type === 'User'
      ).length,
      computers: results.filter(
        item => item.type === 'Computer'
      ).length
    };

    setUnifiedBulkHistory(previous => {
      const updated = [
        entry,
        ...previous
      ].slice(0, 20);

      localStorage.setItem(
        '@kad_unified_bulk_history',
        JSON.stringify(updated)
      );

      return updated;
    });
  };

  const exportUnifiedBulkHistoryCsv = () => {
    if (unifiedBulkHistory.length === 0) {
      toast.error(
        'Nao existem execucoes no historico.'
      );

      return;
    }

    const escapeCsvValue = value => {
      const text = String(
        value ?? ''
      );

      return (
        '"'
        + text.replace(/"/g, '""')
        + '"'
      );
    };

    const rows = [
      [
        'Data e hora',
        'Acao',
        'Total',
        'Sucessos',
        'Falhas',
        'Usuarios',
        'Computadores'
      ],
      ...unifiedBulkHistory.map(entry => [
        entry.dateTime,
        entry.action,
        entry.total,
        entry.success,
        entry.failed,
        entry.users,
        entry.computers
      ])
    ];

    const csvContent = rows
      .map(row =>
        row
          .map(escapeCsvValue)
          .join(';')
      )
      .join('\r\n');

    const blob = new Blob(
      [
        '\ufeff',
        csvContent
      ],
      {
        type: 'text/csv;charset=utf-8'
      }
    );

    const url = URL.createObjectURL(
      blob
    );

    const link = document.createElement(
      'a'
    );

    const date = new Date();

    const stamp = [
      date.getFullYear(),
      String(
        date.getMonth() + 1
      ).padStart(2, '0'),
      String(
        date.getDate()
      ).padStart(2, '0'),
      '_',
      String(
        date.getHours()
      ).padStart(2, '0'),
      String(
        date.getMinutes()
      ).padStart(2, '0'),
      String(
        date.getSeconds()
      ).padStart(2, '0')
    ].join('');

    link.href = url;
    link.download =
      `kad_historico_lotes_${stamp}.csv`;

    document.body.appendChild(
      link
    );

    link.click();
    link.remove();

    URL.revokeObjectURL(
      url
    );

    toast.success(
      `${unifiedBulkHistory.length} execucao(oes) exportada(s).`
    );
  };

  const clearUnifiedBulkHistory = () => {
    localStorage.removeItem(
      '@kad_unified_bulk_history'
    );

    setUnifiedBulkHistory([]);
    setUnifiedBulkHistoryOpen(false);

    toast.success(
      'Historico de lotes limpo.'
    );
  };

  const exportUnifiedBulkCsv = () => {
    if (unifiedBulkItems.length === 0) {
      toast.error(
        'Nao existem objetos validados para exportar.'
      );

      return;
    }

    const escapeCsvValue = value => {
      const text = String(
        value ?? ''
      );

      return (
        '"'
        + text.replace(/"/g, '""')
        + '"'
      );
    };

    const rows = [
      [
        'Entrada original',
        'Identificador',
        'Nome',
        'Tipo',
        'Valido',
        'Selecionado',
        'Estado',
        'Bloqueado',
        'Mensagem'
      ],
      ...unifiedBulkItems.map(item => [
        item.input,
        item.id,
        item.displayName,
        item.type === 'User'
          ? 'Usuario'
          : item.type === 'Computer'
            ? 'Computador'
            : 'Nao validado',
        item.valid
          ? 'Sim'
          : 'Nao',
        item.selected
          ? 'Sim'
          : 'Nao',
        item.enabled === true
          ? 'Ativo'
          : item.enabled === false
            ? 'Desativado'
            : 'Nao informado',
        item.locked
          ? 'Sim'
          : 'Nao',
        item.message
      ])
    ];

    const csvContent = rows
      .map(row =>
        row
          .map(escapeCsvValue)
          .join(';')
      )
      .join('\r\n');

    const blob = new Blob(
      [
        '\ufeff',
        csvContent
      ],
      {
        type:
          'text/csv;charset=utf-8'
      }
    );

    const url = URL.createObjectURL(
      blob
    );

    const link = document.createElement(
      'a'
    );

    const date = new Date();
    const stamp = [
      date.getFullYear(),
      String(
        date.getMonth() + 1
      ).padStart(2, '0'),
      String(
        date.getDate()
      ).padStart(2, '0'),
      '_',
      String(
        date.getHours()
      ).padStart(2, '0'),
      String(
        date.getMinutes()
      ).padStart(2, '0'),
      String(
        date.getSeconds()
      ).padStart(2, '0')
    ].join('');

    link.href = url;
    link.download =
      `kad_objetos_lote_${stamp}.csv`;

    document.body.appendChild(
      link
    );

    link.click();
    link.remove();

    URL.revokeObjectURL(
      url
    );

    toast.success(
      `${unifiedBulkItems.length} objeto(s) exportado(s).`
    );
  };

  const selectAllUnifiedBulkItems = () => {
    setUnifiedBulkItems(previous =>
      previous.map(item => ({
        ...item,
        selected: item.valid
      }))
    );
  };

  const clearUnifiedBulkSelection = () => {
    setUnifiedBulkItems(previous =>
      previous.map(item => ({
        ...item,
        selected: false
      }))
    );
  };

  const executeUnifiedBulkAction = actionType => {
    const selectedItems = unifiedBulkItems.filter(
      item => item.selected && item.valid
    );

    const selectedUsers = selectedItems.filter(
      item => item.type === 'User'
    );

    const selectedComputers = selectedItems.filter(
      item => item.type === 'Computer'
    );

    const users = selectedUsers.filter(item => {
      if (actionType === 'unlock') {
        return item.locked;
      }

      if (actionType === 'enable') {
        return item.enabled !== true;
      }

      if (actionType === 'disable') {
        return item.enabled !== false;
      }

      return true;
    });

    const computers = selectedComputers.filter(item => {
      if (actionType === 'enable') {
        return item.enabled !== true;
      }

      if (actionType === 'disable') {
        return item.enabled !== false;
      }

      return false;
    });

    const ignoredUsers =
      selectedUsers.length - users.length;

    const ignoredComputersByState =
      selectedComputers.length - computers.length;

    if (selectedItems.length === 0) {
      toast.error(
        'Selecione pelo menos um objeto validado.'
      );

      return;
    }

    if (
      actionType === 'unlock'
      && selectedUsers.length === 0
    ) {
      toast.error(
        'O desbloqueio requer pelo menos um usuario.'
      );

      return;
    }

    if (
      actionType === 'unlock'
      && users.length === 0
    ) {
      toast.success(
        'Os usuarios selecionados ja estao sem bloqueio.'
      );

      return;
    }

    if (
      actionType !== 'unlock'
      && users.length === 0
      && computers.length === 0
    ) {
      toast.success(
        actionType === 'enable'
          ? 'Todos os objetos selecionados ja estao ativos.'
          : 'Todos os objetos selecionados ja estao desativados.'
      );

      return;
    }

    const destructive =
      actionType === 'disable';

    setRequireSecurityWord(
      destructive
    );

    setConfirmInputText('');

    const actionLabel =
      actionType === 'unlock'
        ? 'DESBLOQUEAR'
        : actionType === 'enable'
          ? 'ATIVAR'
          : 'DESATIVAR';

    const total =
      actionType === 'unlock'
        ? users.length
        : selectedItems.length;

    const processedUsers =
      users.length;

    const processedComputers =
      actionType === 'unlock'
        ? 0
        : computers.length;

    const ignoredComputers =
      actionType === 'unlock'
        ? selectedComputers.length
        : ignoredComputersByState;

    const ignoredByCurrentState =
      ignoredUsers
      + (
        actionType === 'unlock'
          ? 0
          : ignoredComputersByState
      );

    const confirmationLines = [
      destructive
        ? `Atencao! Esta operacao exige confirmacao de seguranca.`
        : `Revise o resumo antes de prosseguir.`,
      '',
      `Acao: ${actionLabel}`,
      `Usuarios: ${processedUsers}`,
      `Computadores: ${processedComputers}`,
      `Total a processar: ${total}`
    ];

    if (
      actionType === 'unlock'
      && ignoredComputers > 0
    ) {
      confirmationLines.push(
        `Computadores ignorados no desbloqueio: ${ignoredComputers}`
      );
    }

    if (ignoredByCurrentState > 0) {
      confirmationLines.push(
        `Objetos ja no estado desejado: ${ignoredByCurrentState}`
      );
    }

    if (destructive) {
      confirmationLines.push(
        '',
        'Digite "CONFIRMAR" para autorizar.'
      );
    }

    const confirmationMessage =
      confirmationLines.join('\n');

    showConfirm(
      'Objetos Validados em Lote',
      confirmationMessage,
      async () => {
        setUnifiedBulkRunning(true);
        setUnifiedBulkResult(null);

        const executionResults = [];

        try {
          if (users.length > 0) {
            const userResponse = await api.post(
              `/bulk/${actionType}`,
              {
                usernames: users.map(
                  item => item.id
                )
              }
            );

            const userErrors =
              userResponse.data?.errors || [];

            users.forEach(item => {
              const error = userErrors.find(
                current =>
                  current.user === item.id
              );

              executionResults.push({
                id: item.id,
                type: 'User',
                success: !error,
                message: error
                  ? error.error
                  : actionType === 'unlock'
                    ? 'Usuario desbloqueado.'
                    : actionType === 'enable'
                      ? 'Usuario ativado.'
                      : 'Usuario desativado.'
              });
            });
          }

          if (
            computers.length > 0
            && actionType !== 'unlock'
          ) {
            const computerResponse = await api.post(
              `/bulk/computers/${actionType}`,
              {
                usernames: computers.map(
                  item => String(
                    item.id || ''
                  ).replace(/\$$/, '')
                )
              }
            );

            (
              computerResponse.data?.results || []
            ).forEach(item => {
              executionResults.push({
                id: item.computer,
                type: 'Computer',
                success: Boolean(item.success),
                message: item.message
              });
            });
          }

          const success = executionResults.filter(
            item => item.success
          ).length;

          setUnifiedBulkResult({
            total: executionResults.length,
            success,
            failed:
              executionResults.length - success,
            results: executionResults,
            action: actionLabel,
            executedAt: new Date().toISOString()
          });

          saveUnifiedBulkHistory(
            actionLabel,
            executionResults
          );

          const successfulResults =
            executionResults.filter(
              item => item.success
            );

          if (successfulResults.length > 0) {
            const identifiersToRefresh =
              successfulResults.map(
                item => item.id
              );

            const refreshedItems =
              await validateUnifiedBulkWithLimit(
                identifiersToRefresh,
                4
              );

            const refreshedByKey = new Map(
              refreshedItems
                .filter(item => item.valid)
                .map(item => {
                  const key =
                    item.type
                    + ':'
                    + String(
                      item.id || ''
                    ).toUpperCase();

                  return [
                    key,
                    item
                  ];
                })
            );

            setUnifiedBulkItems(previous =>
              previous.map(item => {
                const key =
                  item.type
                  + ':'
                  + String(
                    item.id || ''
                  ).toUpperCase();

                const refreshed =
                  refreshedByKey.get(key);

                if (!refreshed) {
                  return item;
                }

                return {
                  ...item,
                  displayName:
                    refreshed.displayName,
                  enabled:
                    refreshed.enabled,
                  locked:
                    refreshed.locked,
                  valid:
                    refreshed.valid,
                  message:
                    actionType === 'unlock'
                      ? 'Estado atualizado apos desbloqueio.'
                      : actionType === 'enable'
                        ? 'Estado atualizado apos ativacao.'
                        : 'Estado atualizado apos desativacao.'
                };
              })
            );
          }

          toast.success(
            successfulResults.length > 0
              ? 'Processamento concluido e estados atualizados.'
              : 'Processamento concluido sem objetos atualizados.'
          );
        } catch (err) {
          toast.error(
            err.response?.data?.detail
            || 'Falha ao processar os objetos.'
          );
        } finally {
          setUnifiedBulkRunning(false);
        }
      }
    );
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

  const handleComputerBulkAction = (actionType) => {
    const parsedComputers = computerBulkInput
      .replace(/\r/g, '\n')
      .split(',')
      .flatMap(item => item.split(';'))
      .flatMap(item => item.split('\n'))
      .map(item => item.trim().replace(/\$$/, ''))
      .filter(Boolean);

    const uniqueComputers = Array.from(
      new Set(
        parsedComputers.map(
          item => item.toUpperCase()
        )
      )
    );

    if (uniqueComputers.length === 0) {
      toast.error(
        'Insira os nomes dos computadores.'
      );

      return;
    }

    const destructive =
      actionType === 'disable';

    setRequireSecurityWord(
      destructive
    );

    setConfirmInputText('');

    showConfirm(
      'Computadores em Lote',
      destructive
        ? `Atencao! Voce esta prestes a DESATIVAR ${uniqueComputers.length} computador(es). Digite "CONFIRMAR" para autorizar.`
        : `Deseja ATIVAR ${uniqueComputers.length} computador(es)?`,
      async () => {
        setComputerBulkLoading(true);
        setComputerBulkResult(null);

        try {
          const response = await api.post(
            `/bulk/computers/${actionType}`,
            {
              usernames: uniqueComputers
            }
          );

          setComputerBulkResult(
            response.data
          );

          setComputerBulkView(
            response.data?.results?.length === 1
              ? 'detail'
              : 'list'
          );

          toast.success(
            'Lote de computadores finalizado.'
          );
        } catch (err) {
          toast.error(
            err.response?.data?.detail
            || 'Falha ao processar computadores em lote.'
          );
        } finally {
          setComputerBulkLoading(false);
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
  
  const handleToggleForceChange = async () => {
    // Valor atual antes do clique
    const isForced = selectedUser.pwdLastSet === 0;
    const newVal = !isForced;
    
    // 1. Atualização Otimista: Muda o botão IMEDIATAMENTE na tela para não parecer travado
    setSelectedUser(prev => ({ ...prev, pwdLastSet: newVal ? 0 : -1 }));
    
    // 2. Mostra um aviso de carregamento discreto
    const toastId = toast.loading('Sincronizando política com o AD...');
    
    try { 
      // 3. Dispara o PowerShell em segundo plano
      await api.post(`/users/${selectedUser.SamAccountName}/force-change`, { force: newVal }); 
      toast.success(`Exigência de senha ${newVal ? 'ativada' : 'removida'} com sucesso!`, { id: toastId }); 
    } catch (err) { 
      // 4. Se o PowerShell falhar (ex: rede caiu), o botão volta ao estado original sozinho
      setSelectedUser(prev => ({ ...prev, pwdLastSet: isForced ? 0 : -1 }));
      toast.error(err.response?.data?.detail || 'Erro ao alterar exigência.', { id: toastId }); 
    }
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

      // --- CÓPIA AUTOMÁTICA ---
      const texto = `🔒 Atualização de Credenciais - KAD Mobile\n\n` +
        `👤 Usuário: ${selectedUser.SamAccountName}\n` +
        `🔑 Senha Provisória: ${newPassword}\n` +
        `ℹ️ Status: Conta ${unlockAccount ? 'desbloqueada' : 'processada'}.\n` +
        `⚠️ Nota: ${forceChange ? 'Será exigida a alteração da senha no primeiro logon.' : 'Senha configurada em modo contínuo.'}`;
      
      navigator.clipboard.writeText(texto);

      // Alerta unificado confirmando as duas ações
      toast.success('Senha aplicada e resumo copiado para área de transferência!'); 
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

  const handleOpenEditProfile = () => {
    setManagerSearch('');
    setManagerResults([]);
    setModalEditOpen(true);
  };

  const handleSearchManager = async () => {
    const termo = managerSearch.trim();

    if (termo.length < 2) {
      toast.error('Digite pelo menos 2 caracteres.');
      return;
    }

    setManagerLoading(true);
    setManagerResults([]);

    try {
      const response = await api.get(
        `/users/${encodeURIComponent(termo)}`
      );

      const dados = Array.isArray(response.data.data)
        ? response.data.data
        : [];

      const usuarios = dados
        .filter(item =>
          item.Type === 'User' &&
          item.DN &&
          item.SamAccountName !== selectedUser.SamAccountName
        )
        .slice(0, 10);

      setManagerResults(usuarios);

      if (usuarios.length === 0) {
        toast.error('Nenhum usuário válido encontrado.');
      }
    } catch (err) {
      toast.error(
        err.response?.data?.detail ||
        'Falha ao pesquisar gerente no AD.'
      );
    } finally {
      setManagerLoading(false);
    }
  };

  const handleSelectManager = (manager) => {
    setEditData(prev => ({
      ...prev,
      manager_dn: manager.DN,
      manager_label:
        `${manager.DisplayName} (${manager.SamAccountName})`
    }));

    setManagerSearch('');
    setManagerResults([]);
  };

  const handleClearManager = () => {
    setEditData(prev => ({
      ...prev,
      manager_dn: '',
      manager_label: ''
    }));

    setManagerSearch('');
    setManagerResults([]);
  };

  const handleSaveProfile = async () => {
    setProfileLoading(true);

    const payload = {
      title: editData.title.trim(),
      department: editData.department.trim(),
      telephone: editData.telephone.trim(),
      description: editData.description,
      manager_dn: editData.manager_dn
    };

    try {
      const response = await api.post(
        `/users/${selectedUser.SamAccountName}/edit-profile`,
        payload
      );

      toast.success(
        response.data.message || 'Perfil atualizado.'
      );

      setModalEditOpen(false);
      await handleSearch();
    } catch (err) {
      toast.error(
        err.response?.data?.detail ||
        'Erro ao atualizar perfil.'
      );
    } finally {
      setProfileLoading(false);
    }
  };

  const openMoveModal = async () => {
    setModalMoveOpen(true); 
    if (treeData.length > 0) return; 
    setLoadingOus(true);
    try { 
      const response = await api.get('/ous'); 
      const flatOus = response.data.data;

      if (flatOus && flatOus.length > 0) {
        // 1. Descobre a raiz do domínio (Ex: DC=kinrossgold,DC=com)
        const firstDnParts = flatOus[0].dn.split(',');
        const baseDn = firstDnParts.filter(p => p.toUpperCase().startsWith('DC=')).join(',');
        
        const root = { dn: baseDn, ou: baseDn, isRoot: true, children: [] };
        const nodeMap = { [baseDn.toUpperCase()]: root };

        // 2. Ordena pelas OUs mais altas primeiro (menos vírgulas)
        const sorted = [...flatOus].sort((a, b) => (a.dn.match(/,/g) || []).length - (b.dn.match(/,/g) || []).length);

        // 3. Monta a árvore dinamicamente
        sorted.forEach(item => {
            const dn = item.dn;
            const parts = dn.split(',');
            const parentDn = parts.slice(1).join(',').toUpperCase(); // DN do Pai
            
            // Extrai só o nome da pasta limpando o OU=
            const cleanOu = parts[0].replace('OU=', '').replace('CN=', '');
            const newNode = { ...item, ou: cleanOu, children: [] };
            
            nodeMap[dn.toUpperCase()] = newNode;

            if (nodeMap[parentDn]) {
                nodeMap[parentDn].children.push(newNode);
            } else {
                root.children.push(newNode); // Pendura na raiz se o pai não existir
            }
        });
        
        setTreeData([root]); // Salva a árvore no estado
      }
    } 
    catch (err) { toast.error('Falha ao obter árvore de diretórios.'); } 
    finally { setLoadingOus(false); }
  };

  const handleMoveOu = async () => { 
    // REPLICA A REGRA DO DESKTOP: Proíbe mover para a raiz do domínio!
    if (selectedOu.toUpperCase().includes('DC=') && !selectedOu.toUpperCase().includes('OU=')) {
      return toast.error('Aviso: Você não pode mover um objeto diretamente para a raiz estrutural do domínio.');
    }

    try { 
      await api.post(`/users/${selectedUser.SamAccountName}/move`, { new_ou: selectedOu }); 
      toast.success('Objeto movido organizacionalmente.'); 
      setModalMoveOpen(false); 
      handleSearch(); 
    } 
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

  React.useEffect(() => {
    if (innerTab === 'atributos' && selectedUser && !attrData) {
      setAttrLoading(true);
      api.get(`/users/${selectedUser.SamAccountName}/attributes`)
        .then(res => setAttrData(res.data.data))
        .catch(() => toast.error('Falha ao extrair matriz de atributos do AD.'))
        .finally(() => setAttrLoading(false));
    }
  }, [innerTab, selectedUser, attrData]);

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
      <div className="kadTop" style={{ position: 'sticky', top: 0, zIndex: 100, backgroundColor: COLORS.bg }}>
        
        {/* HEADER */}
        <div className="kadHeader" style={styles.header}>
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
        <div className="kadTabs" style={styles.tabContainer}>
          <button style={activeTab === 'single' ? styles.tabActive : styles.tabInactive} data-on={activeTab === 'single' ? 'true' : 'false'} onClick={() => setActiveTab('single')}><Search size={16} /> Identity</button>
          <button style={activeTab === 'bulk' ? styles.tabActive : styles.tabInactive} data-on={activeTab === 'bulk' ? 'true' : 'false'} onClick={() => setActiveTab('bulk')}><Layers size={16} /> Bulk</button>
          <button style={activeTab === 'compare' ? styles.tabActive : styles.tabInactive} data-on={activeTab === 'compare' ? 'true' : 'false'} onClick={() => setActiveTab('compare')}><Scale size={16} /> Compare</button>
          {/* ABA PRINT OCULTA <button style={activeTab === 'printers' ? styles.tabActive : styles.tabInactive} data-on={activeTab === 'printers' ? 'true' : 'false'} onClick={() => setActiveTab('printers')}><Printer size={16} /> Print</button> */}
          
          {/* NOVA ABA: VETORH DIRETO */}
          <button style={activeTab === 'vetorh_direct' ? styles.tabActive : styles.tabInactive} data-on={activeTab === 'vetorh_direct' ? 'true' : 'false'} onClick={() => setActiveTab('vetorh_direct')}><Database size={16} /> Vetorh</button>
        </div>
        
      </div>
      {/* ==================================================== */}

      <div className="kadContent" style={styles.content}>
        
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
              <div className="kadSummary" style={styles.summaryGrid}>
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

                <section
                  aria-labelledby="xupervisor-status-title"
                  style={{
                    ...styles.summaryCard,
                    gridColumn: '1 / -1',
                    padding: '18px'
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '12px',
                      flexWrap: 'wrap'
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}
                    >
                      <Server
                        size={18}
                        color={COLORS.gold}
                      />

                      <span
                        id="xupervisor-status-title"
                        style={styles.summaryLabel}
                      >
                        Saude do Xupervisor
                      </span>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px'
                      }}
                    >
                      <span
                        style={{
                          color:
                            xupervisorStatus?.status === 'healthy'
                              ? COLORS.success
                              : COLORS.warning,
                          fontWeight: 'bold',
                          fontSize: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        {xupervisorStatus?.status === 'healthy'
                          ? <CheckCircle size={14} />
                          : <AlertTriangle size={14} />}

                        {xupervisorStatusLoading
                          ? 'Atualizando...'
                          : xupervisorStatus?.status === 'healthy'
                            ? 'Saudavel'
                            : 'Atencao'}
                      </span>

                      <button
                        type="button"
                        aria-label="Atualizar status do Xupervisor"
                        title="Atualizar status do Xupervisor"
                        onClick={() => fetchXupervisorStatus(true)}
                        disabled={xupervisorStatusLoading}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: '32px',
                          height: '32px',
                          borderRadius: '7px',
                          border: `1px solid ${COLORS.border}`,
                          backgroundColor: COLORS.cell,
                          color: COLORS.text,
                          cursor: xupervisorStatusLoading
                            ? 'not-allowed'
                            : 'pointer',
                          opacity: xupervisorStatusLoading
                            ? 0.65
                            : 1
                        }}
                      >
                        <RefreshCw size={14} />
                      </button>
                    </div>
                  </div>

                  {xupervisorStatusError ? (
                    <div
                      role="alert"
                      style={{
                        marginTop: '12px',
                        color: COLORS.danger,
                        fontSize: '12px'
                      }}
                    >
                      {xupervisorStatusError}
                    </div>
                  ) : (
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns:
                          'repeat(auto-fit, minmax(135px, 1fr))',
                        gap: '10px',
                        marginTop: '14px'
                      }}
                    >
                      {[
                        {
                          label: 'Inventario atual',
                          value:
                            xupervisorStatus?.database?.current_rows
                            || 0
                        },
                        {
                          label: 'Com MAC',
                          value:
                            xupervisorStatus?.database?.rows_with_mac
                            || 0
                        },
                        {
                          label: 'Multiplos MACs',
                          value:
                            xupervisorStatus?.database
                              ?.rows_with_multiple_mac
                            || 0
                        },
                        {
                          label: 'Integridade',
                          value:
                            xupervisorStatus?.database?.integrity
                            || 'indisponivel'
                        },
                        {
                          label: 'Ultima exportacao',
                          value: formatXupervisorDate(
                            xupervisorStatus?.synchronization
                              ?.export?.data_hora
                          )
                        },
                        {
                          label: 'Ultima publicacao',
                          value: formatXupervisorDate(
                            xupervisorStatus?.synchronization
                              ?.publication?.date_time
                          )
                        },
                        {
                          label: 'Sincronizacao',
                          value:
                            xupervisorStatus?.synchronization?.running
                              ? 'Em andamento'
                              : 'Concluida'
                        }
                      ].map((item) => (
                        <div
                          key={item.label}
                          style={{
                            padding: '10px',
                            borderRadius: '7px',
                            border: `1px solid ${COLORS.border}`,
                            backgroundColor: COLORS.cell
                          }}
                        >
                          <div
                            style={{
                              color: COLORS.muted,
                              fontSize: '10px',
                              marginBottom: '5px'
                            }}
                          >
                            {item.label}
                          </div>

                          <div
                            style={{
                              color: COLORS.text,
                              fontSize: '14px',
                              fontWeight: '700'
                            }}
                          >
                            {item.value}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {!xupervisorStatusError
                    && isXupervisorPublicationStale(
                      xupervisorStatus?.synchronization
                        ?.publication?.date_time
                    ) && (
                      <div
                        role="alert"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          marginTop: '12px',
                          padding: '10px',
                          borderRadius: '7px',
                          border:
                            '1px solid rgba(245, 158, 11, 0.35)',
                          backgroundColor:
                            'rgba(245, 158, 11, 0.08)',
                          color: COLORS.warning,
                          fontSize: '12px',
                          fontWeight: '600'
                        }}
                      >
                        <AlertTriangle size={15} />

                        Publicacao do inventario sem atualizacao
                        nas ultimas 24 horas.
                      </div>
                    )}
                </section>

                <section
                  aria-labelledby="search-performance-title"
                  style={{
                    ...styles.summaryCard,
                    gridColumn: '1 / -1',
                    padding: '18px',
                    overflow: 'hidden'
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '12px',
                      flexWrap: 'wrap',
                      marginBottom: '15px'
                    }}
                  >
                    <div>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px'
                        }}
                      >
                        <Activity
                          size={18}
                          color={COLORS.gold}
                        />

                        <span
                          id="search-performance-title"
                          style={styles.summaryLabel}
                        >
                          Desempenho do Motor de Busca
                        </span>
                      </div>

                      <div
                        style={{
                          color: COLORS.muted,
                          fontSize: '11px',
                          marginTop: '5px'
                        }}
                      >
                        Indicadores sem exibir o termo pesquisado
                      </div>
                    </div>

                    <button
                      type="button"
                      aria-label="Atualizar indicadores de desempenho"
                      title="Atualizar indicadores"
                      onClick={() => fetchSearchIndicators(true)}
                      disabled={searchPerformanceLoading}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '7px',
                        minHeight: '34px',
                        padding: '7px 12px',
                        borderRadius: '7px',
                        border: `1px solid ${COLORS.border}`,
                        backgroundColor: COLORS.cell,
                        color: COLORS.text,
                        cursor: searchPerformanceLoading
                          ? 'not-allowed'
                          : 'pointer',
                        opacity: searchPerformanceLoading
                          ? 0.65
                          : 1,
                        fontWeight: '600',
                        fontSize: '12px'
                      }}
                    >
                      <RefreshCw size={14} />

                      {searchPerformanceLoading
                        ? 'Atualizando...'
                        : 'Atualizar'}
                    </button>
                  </div>

                  <div aria-live="polite">
                    {searchPerformanceError ? (
                      <div
                        role="alert"
                        style={{
                          padding: '11px',
                          borderRadius: '7px',
                          color: COLORS.danger,
                          backgroundColor: 'rgba(239, 68, 68, 0.08)',
                          border: '1px solid rgba(239, 68, 68, 0.25)',
                          fontSize: '12px'
                        }}
                      >
                        {searchPerformanceError}
                      </div>
                    ) : !searchPerformance ? (
                      <div
                        style={{
                          color: COLORS.muted,
                          fontSize: '12px'
                        }}
                      >
                        {searchPerformanceLoading
                          ? 'Carregando indicadores...'
                          : 'Nenhuma medicao disponivel.'}
                      </div>
                    ) : (
                      <>
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(125px, 1fr))',
                            gap: '10px'
                          }}
                        >
                          {[
                            {
                              label: 'Analisadas',
                              value: searchPerformance.analyzed_count || 0,
                              color: COLORS.text,
                              icon: BarChart
                            },
                            {
                              label: 'Rapidas',
                              value: searchPerformance.summary?.fast_count || 0,
                              color: COLORS.success,
                              icon: CheckCircle
                            },
                            {
                              label: 'Lentas',
                              value: searchPerformance.summary?.slow_count || 0,
                              color: COLORS.warning,
                              icon: Clock
                            },
                            {
                              label: 'Criticas',
                              value: searchPerformance.summary?.critical_count || 0,
                              color: COLORS.danger,
                              icon: AlertTriangle
                            },
                            {
                              label: 'Media LDAP',
                              value: formatPerformanceMs(
                                searchPerformance.averages_ms?.ldap_search
                              ),
                              color: COLORS.gold,
                              icon: Activity
                            },
                            {
                              label: 'Pior tempo',
                              value: formatPerformanceMs(
                                searchPerformance.maximums_ms?.total
                              ),
                              color: COLORS.danger,
                              icon: Clock
                            }
                          ].map((metric) => {
                            const MetricIcon = metric.icon;

                            return (
                              <div
                                key={metric.label}
                                style={{
                                  padding: '11px',
                                  borderRadius: '8px',
                                  backgroundColor: COLORS.cell,
                                  border: `1px solid ${COLORS.border}`,
                                  minWidth: 0
                                }}
                              >
                                <div
                                  style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    gap: '7px'
                                  }}
                                >
                                  <span
                                    style={{
                                      color: COLORS.muted,
                                      fontSize: '11px',
                                      fontWeight: '600'
                                    }}
                                  >
                                    {metric.label}
                                  </span>

                                  <MetricIcon
                                    size={14}
                                    color={metric.color}
                                  />
                                </div>

                                <div
                                  style={{
                                    color: metric.color,
                                    fontSize: '20px',
                                    fontWeight: '800',
                                    marginTop: '7px'
                                  }}
                                >
                                  {metric.value}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                            gap: '10px',
                            marginTop: '11px'
                          }}
                        >
                          <div
                            style={{
                              padding: '11px',
                              borderRadius: '8px',
                              backgroundColor: COLORS.cell,
                              border: `1px solid ${COLORS.border}`
                            }}
                          >
                            <div
                              style={{
                                color: COLORS.muted,
                                fontSize: '11px',
                                fontWeight: '700',
                                marginBottom: '8px'
                              }}
                            >
                              Modos LDAP
                            </div>

                            <div
                              style={{
                                display: 'flex',
                                flexWrap: 'wrap',
                                gap: '7px'
                              }}
                            >
                              {['exact', 'prefix', 'contains', 'cache'].map((mode) => (
                                <span
                                  key={mode}
                                  style={{
                                    padding: '5px 8px',
                                    borderRadius: '999px',
                                    backgroundColor: 'rgba(197, 160, 89, 0.10)',
                                    border: '1px solid rgba(197, 160, 89, 0.25)',
                                    color: COLORS.text,
                                    fontSize: '11px'
                                  }}
                                >
                                  {mode}: {searchPerformance.ldap_modes?.[mode] || 0}
                                </span>
                              ))}
                            </div>
                          </div>

                          <div
                            style={{
                              padding: '11px',
                              borderRadius: '8px',
                              backgroundColor: COLORS.cell,
                              border: `1px solid ${COLORS.border}`,
                              color: COLORS.text,
                              fontSize: '11px',
                              lineHeight: '1.7'
                            }}
                          >
                            <div>
                              Arquivos lidos: {searchPerformance.files_found || 0}
                            </div>

                            <div>
                              Linhas invalidas: {searchPerformance.invalid_lines || 0}
                            </div>

                            <div>
                              Lento: 3 s | Critico: 10 s
                            </div>
                          </div>
                        </div>

                        <div
                          style={{
                            marginTop: '11px',
                            padding: '12px',
                            borderRadius: '8px',
                            backgroundColor: COLORS.cell,
                            border: `1px solid ${COLORS.border}`
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              gap: '10px',
                              flexWrap: 'wrap',
                              marginBottom: '11px'
                            }}
                          >
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px'
                              }}
                            >
                              <Database
                                size={16}
                                color={COLORS.gold}
                              />

                              <span
                                style={{
                                  color: COLORS.text,
                                  fontSize: '12px',
                                  fontWeight: '700'
                                }}
                              >
                                Cache de Busca
                              </span>
                            </div>

                            <span
                              style={{
                                color: searchCache?.enabled
                                  ? COLORS.success
                                  : COLORS.danger,
                                fontSize: '11px',
                                fontWeight: '700'
                              }}
                            >
                              {searchCacheLoading
                                ? 'Atualizando...'
                                : searchCache?.enabled
                                  ? 'Ativo'
                                  : 'Indisponivel'}
                            </span>
                          </div>

                          {searchCacheError ? (
                            <div
                              role="alert"
                              style={{
                                padding: '10px',
                                borderRadius: '7px',
                                color: COLORS.danger,
                                backgroundColor: 'rgba(239, 68, 68, 0.08)',
                                border: '1px solid rgba(239, 68, 68, 0.25)',
                                fontSize: '11px'
                              }}
                            >
                              {searchCacheError}
                            </div>
                          ) : !searchCache ? (
                            <div
                              style={{
                                color: COLORS.muted,
                                fontSize: '11px'
                              }}
                            >
                              {searchCacheLoading
                                ? 'Carregando metricas do cache...'
                                : 'Nenhuma metrica de cache disponivel.'}
                            </div>
                          ) : (
                            <>
                              <div
                                style={{
                                  display: 'grid',
                                  gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
                                  gap: '8px'
                                }}
                              >
                                {[
                                  {
                                    label: 'Entradas',
                                    value: `${searchCache.current_entries || 0}/${searchCache.max_entries || 0}`,
                                    color: COLORS.text
                                  },
                                  {
                                    label: 'Taxa de acerto',
                                    value: `${getSearchCacheHitRate()}%`,
                                    color: getSearchCacheHitRate() > 0
                                      ? COLORS.success
                                      : COLORS.muted
                                  },
                                  {
                                    label: 'Hits',
                                    value: searchCache.metrics?.hits || 0,
                                    color: COLORS.success
                                  },
                                  {
                                    label: 'Misses',
                                    value: searchCache.metrics?.misses || 0,
                                    color: COLORS.warning
                                  },
                                  {
                                    label: 'Expiradas',
                                    value: searchCache.metrics?.expired || 0,
                                    color: COLORS.gold
                                  },
                                  {
                                    label: 'Removidas',
                                    value: searchCache.metrics?.evictions || 0,
                                    color: COLORS.warning
                                  },
                                  {
                                    label: 'Invalidacoes',
                                    value: searchCache.metrics?.invalidations || 0,
                                    color: COLORS.danger
                                  },
                                  {
                                    label: 'TTL',
                                    value: `${searchCache.ttl_seconds || 0} s`,
                                    color: COLORS.gold
                                  }
                                ].map((metric) => (
                                  <div
                                    key={metric.label}
                                    style={{
                                      padding: '10px',
                                      borderRadius: '7px',
                                      backgroundColor: COLORS.bg,
                                      border: `1px solid ${COLORS.border}`,
                                      minWidth: 0
                                    }}
                                  >
                                    <div
                                      style={{
                                        color: COLORS.muted,
                                        fontSize: '10px',
                                        fontWeight: '600'
                                      }}
                                    >
                                      {metric.label}
                                    </div>

                                    <div
                                      style={{
                                        color: metric.color,
                                        fontSize: '17px',
                                        fontWeight: '800',
                                        marginTop: '6px',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis'
                                      }}
                                    >
                                      {metric.value}
                                    </div>
                                  </div>
                                ))}
                              </div>

                              <div
                                style={{
                                  color: COLORS.muted,
                                  fontSize: '10px',
                                  marginTop: '9px',
                                  lineHeight: '1.5'
                                }}
                              >
                                O cache permanece apenas em memoria,
                                expira automaticamente e e invalidado
                                depois de alteracoes no Active Directory.
                              </div>
                            </>
                          )}
                        </div>

                        {Array.isArray(searchPerformance.slowest_searches)
                          && searchPerformance.slowest_searches.length > 0
                          && (
                            <details
                              style={{
                                marginTop: '11px',
                                padding: '11px',
                                borderRadius: '8px',
                                backgroundColor: COLORS.cell,
                                border: `1px solid ${COLORS.border}`
                              }}
                            >
                              <summary
                                style={{
                                  cursor: 'pointer',
                                  color: COLORS.gold,
                                  fontSize: '12px',
                                  fontWeight: '700'
                                }}
                              >
                                Consultas mais lentas
                              </summary>

                              <div
                                style={{
                                  display: 'grid',
                                  gap: '7px',
                                  marginTop: '10px',
                                  maxHeight: '240px',
                                  overflowY: 'auto'
                                }}
                              >
                                {searchPerformance.slowest_searches.map(
                                  (item, index) => (
                                    <div
                                      key={`${item.timestamp || 'item'}-${index}`}
                                      style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'minmax(110px, 1fr) auto',
                                        gap: '10px',
                                        alignItems: 'center',
                                        padding: '8px',
                                        borderRadius: '6px',
                                        backgroundColor: COLORS.bg,
                                        border: `1px solid ${COLORS.border}`,
                                        fontSize: '11px'
                                      }}
                                    >
                                      <span
                                        style={{
                                          color: COLORS.text,
                                          overflow: 'hidden',
                                          textOverflow: 'ellipsis',
                                          whiteSpace: 'nowrap'
                                        }}
                                      >
                                        {item.ldap_mode || 'unknown'}
                                        {' | '}
                                        {item.result_count || 0} resultado(s)
                                        {' | '}
                                        tamanho {item.term_length || 0}
                                      </span>

                                      <span
                                        style={{
                                          color: item.classification === 'critical'
                                            ? COLORS.danger
                                            : item.classification === 'slow'
                                              ? COLORS.warning
                                              : COLORS.success,
                                          fontWeight: '700',
                                          whiteSpace: 'nowrap'
                                        }}
                                      >
                                        {formatPerformanceMs(item.total_ms)}
                                      </span>
                                    </div>
                                  )
                                )}
                              </div>
                            </details>
                          )}
                      </>
                    )}
                  </div>
                </section>
              </div>
            )}

            {searchResults.length > 1 && !selectedUser && (
              <div>
                <p style={{ color: COLORS.gold, marginBottom: '15px', fontWeight: 'bold' }}>Resultados da pesquisa ({searchResults.length}):</p>
                <div style={styles.listGrid}>
                  {searchResults.map((item, idx) => {
                    const isDanger = !item.Enabled || item.LockedOut;
                    return (
                      <div className="idResult" key={idx} onClick={() => selectUserForDetail(item)} style={{...styles.miniCard, borderColor: isDanger ? COLORS.danger : COLORS.border}}>
                        
                        {/* NOVO: CHECKBOX DO CARRINHO */}
                        <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px' }}>
                          <input 
                            type="checkbox" 
                            checked={isItemInCart(item)} 
                            onChange={(e) => toggleCartItem(item, e)} 
                            style={{...styles.checkbox, width: '18px', height: '18px'}} 
                          />
                        </div>

                        <div style={{...styles.miniAvatar, color: isDanger ? COLORS.danger : COLORS.gold, backgroundColor: isDanger ? 'rgba(239, 68, 68, 0.1)' : COLORS.cell}}>
                          {renderIcon(item.Type)}
                        </div>
                        <div style={{ flex: 1 }}>
                          <h4 style={{...styles.miniCardTitle, color: isDanger ? COLORS.danger : COLORS.text}}>
                             {item.DisplayName} {isDanger && <Ban size={12} style={{marginLeft: '6px'}} />}
                          </h4>
                          <p style={styles.miniCardSubtitle}>
                             <span className="idCopy" title="Copiar login" onClick={(e) => { e.stopPropagation(); kadCopyText(item.SamAccountName); }}>{item.SamAccountName}</span> {item.EmployeeID ? `• Mat: ${item.EmployeeID}` : ''}
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
              <div className="idDetail" style={styles.card}>
                {searchResults.length > 1 && <button onClick={() => setSelectedUser(null)} style={styles.backBtn}><ArrowLeft size={16} /> Voltar à lista</button>}
                <div className="idHead" style={styles.cardHeader}>
                  <div style={styles.avatar}>{renderIcon(selectedUser.Type, 24)}</div>
                  <div style={{flex: 1}}>
                    <h3 style={styles.cardTitle}>{selectedUser.DisplayName}</h3>
                    <p style={styles.cardSubtitle}><span className="idCopy" title="Copiar" onClick={() => kadCopyText(selectedUser.SamAccountName)}>{selectedUser.SamAccountName}</span> {selectedUser.EmployeeID ? `• Matrícula: ${selectedUser.EmployeeID}` : ''}</p>
                  </div>
                </div>

                <div className="idStatus" style={styles.statusRow}>
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

                <div className="idTabs" style={styles.innerTabs}>
                  <button style={innerTab === 'geral' ? styles.innerTabActive : styles.innerTabInactive} data-on={innerTab === 'geral' ? 'true' : 'false'} onClick={() => setInnerTab('geral')}>Geral</button>
                  {isUser && <button style={innerTab === 'seguranca' ? styles.innerTabActive : styles.innerTabInactive} data-on={innerTab === 'seguranca' ? 'true' : 'false'} onClick={() => setInnerTab('seguranca')}>Segurança</button>}
                  {isComputer && <button style={innerTab === 'seguranca' ? styles.innerTabActive : styles.innerTabInactive} data-on={innerTab === 'seguranca' ? 'true' : 'false'} onClick={() => setInnerTab('seguranca')}>Diagnósticos</button>}
                  <button style={innerTab === 'grupos' ? styles.innerTabActive : styles.innerTabInactive} data-on={innerTab === 'grupos' ? 'true' : 'false'} onClick={() => setInnerTab('grupos')}>
                    {isGroup ? `Membros (${selectedUser.Members?.length || 0})` : `Grupos (${selectedUser.MemberOf?.length || 0})`}
                  </button>
                  {/* NOVA ABA AQUI */}
                  <button style={innerTab === 'atributos' ? styles.innerTabActive : styles.innerTabInactive} data-on={innerTab === 'atributos' ? 'true' : 'false'} onClick={() => setInnerTab('atributos')}>
                    Editor de Atributos
                  </button>
                  {isUser && selectedUser.EmployeeID && <button style={innerTab === 'vetorh' ? styles.innerTabActive : styles.innerTabInactive} data-on={innerTab === 'vetorh' ? 'true' : 'false'} onClick={() => setInnerTab('vetorh')}>Vetorh DB</button>}
                </div>

                <div style={styles.innerContent}>
                  
                  {/* ABA GERAL */}
                  {innerTab === 'geral' && (
                    <>
                      {isComputer && (
                        <>
                          <p style={styles.sectionLabel}>Identificação de Rede</p>
                          <div style={styles.detailGrid}>
                            <div style={styles.detailItem}><span style={styles.detailLabel}>DNS</span><span style={styles.detailValue}><span className="idCopy" title="Copiar" onClick={() => kadCopyText(selectedUser.DNS)}>{selectedUser.DNS}</span></span></div>
                            <div style={styles.detailItem}><span style={styles.detailLabel}>IPv4</span><span style={styles.detailValue}><span className="idCopy" title="Copiar" onClick={() => kadCopyText(selectedUser.IPv4)}>{selectedUser.IPv4}</span></span></div>
                            <div style={styles.detailItem}><span style={styles.detailLabel}>S. Operacional</span><span style={styles.detailValue}>{selectedUser.OS}</span></div>
                            <div style={styles.detailItem}><span style={styles.detailLabel}>Gerenciado Por</span><span style={styles.detailValue}>{selectedUser.Manager}</span></div>
                            <div style={styles.detailItemFull}><span style={styles.detailLabel}>Descrição</span><span style={styles.detailValue}>{selectedUser.Description}</span></div>
                            <div style={styles.detailItemFull}><span style={styles.detailLabel}>Última Ativação</span><span style={styles.detailValue}>{selectedUser.LastLogon}</span></div>
                          </div>

                          <p style={{
                            ...styles.sectionLabel,
                            marginTop: '20px'
                          }}>
                            {'Invent\u00e1rio Xupervisor'}
                          </p>

                          {xupervisorLoading ? (
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px',
                              padding: '12px 0',
                              color: COLORS.gold
                            }}>
                              <div style={styles.spinner}></div>
                              <span style={styles.detailValue}>
                                {'Consultando invent\u00e1rio...'}
                              </span>
                            </div>
                          ) : xupervisorError ? (
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              padding: '10px 0',
                              color: COLORS.warning
                            }}>
                              <AlertTriangle size={15} />
                              <span style={styles.detailValue}>
                                {xupervisorError}
                              </span>
                            </div>
                          ) : xupervisorData ? (
                            <div style={styles.detailGrid}>
                              {[
                                {
                                  label: 'Fabricante',
                                  value: xupervisorData.Manufacturer
                                },
                                {
                                  label: 'Modelo',
                                  value: xupervisorData.Model
                                },
                                {
                                  label: 'Serial Number',
                                  value: xupervisorData.SerialNumber,
                                  full: true
                                },
                                {
                                  label: 'Gerenciado Por no AD',
                                  value: selectedUser.Manager
                                },
                                {
                                  label: 'Primary User',
                                  value: xupervisorData.PrimaryUser
                                },
                                {
                                  label: '\u00daltimo usu\u00e1rio conectado',
                                  value: xupervisorData.LastLoggedOnUser
                                },
                                {
                                  label: 'Total de usu\u00e1rios locais',
                                  value: xupervisorData.TotalLocalUsers
                                },
                                {
                                  label: 'Mem\u00f3ria RAM',
                                  value:
                                    xupervisorData.TotalRamGB != null
                                      ? `${xupervisorData.TotalRamGB} GB`
                                      : null
                                },
                                {
                                  label: 'Armazenamento',
                                  value:
                                    xupervisorData.TotalStorageGB != null
                                      ? `${xupervisorData.TotalStorageGB} GB`
                                      : null
                                },
                                {
                                  label: 'Sistema Operacional',
                                  value: xupervisorData.OperatingSystem,
                                  full: true
                                },
                                {
                                  label: 'Endere\u00e7o IP',
                                  value: xupervisorData.IPAddress,
                                  full: true
                                },
                                {
                                  label: 'Endereços MAC',
                                  value: xupervisorData.MacAddresses
                                    ? xupervisorData.MacAddresses
                                        .split(';')
                                        .join(' • ')
                                    : null,
                                  full: true
                                },
                                {
                                  label: 'Status',
                                  value: xupervisorData.Status
                                },
                                {
                                  label: 'Possui agente',
                                  value: xupervisorData.HasAgent
                                },
                                {
                                  label: 'BIOS',
                                  value: xupervisorData.BiosVersion
                                },
                                {
                                  label: 'Departamento',
                                  value: xupervisorData.Department
                                },
                                {
                                  label: '\u00daltima coleta',
                                  value: xupervisorData.LastScanned,
                                  full: true
                                },
                                {
                                  label: 'Origem',
                                  value: xupervisorData.ImportedAt
                                    ? `Xupervisor \u2022 Importado em ${xupervisorData.ImportedAt}`
                                    : 'Xupervisor',
                                  full: true
                                }
                              ].map((item, index) => (
                                <div
                                  key={`xupervisor-${index}`}
                                  style={
                                    item.full
                                      ? styles.detailItemFull
                                      : styles.detailItem
                                  }
                                >
                                  <span style={styles.detailLabel}>
                                    {item.label}
                                  </span>
                                  <span style={styles.detailValue}>
                                    {item.value ?? 'N/A'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div style={styles.detailItemFull}>
                              <span style={styles.detailValue}>
                                {'Invent\u00e1rio n\u00e3o carregado.'}
                              </span>
                            </div>
                          )}

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
                          
                          <p style={{
                            ...styles.sectionLabel,
                            marginTop: '20px'
                          }}>
                            Equipamentos gerenciados ({managedComputers.length})
                          </p>

                          <div style={{
                            ...styles.detailItemFull,
                            marginBottom: '4px'
                          }}>
                            {managedComputersLoading ? (
                              <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                color: COLORS.gold,
                                padding: '10px 0'
                              }}>
                                <div style={styles.spinner}></div>
                                <span style={styles.detailValue}>
                                  Consultando computadores no AD...
                                </span>
                              </div>
                            ) : managedComputersError ? (
                              <div style={{
                                color: COLORS.danger,
                                fontSize: '12px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '7px'
                              }}>
                                <AlertTriangle size={14} />
                                {managedComputersError}
                              </div>
                            ) : managedComputers.length === 0 ? (
                              <span style={styles.detailValue}>
                                Nenhum computador possui este usuário em Gerenciado Por.
                              </span>
                            ) : (
                              <div style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '8px',
                                maxHeight: '300px',
                                overflowY: 'auto',
                                paddingRight: '4px'
                              }}>
                                {managedComputers.map(
                                  (computer, index) => (
                                    <button
                                      key={
                                        computer.DN ||
                                        computer.SamAccountName ||
                                        index
                                      }
                                      type="button"
                                      onClick={() =>
                                        openManagedComputer(computer)
                                      }
                                      style={{
                                        width: '100%',
                                        backgroundColor: COLORS.bg,
                                        border: `1px solid ${
                                          computer.Enabled
                                            ? COLORS.border
                                            : COLORS.danger
                                        }`,
                                        borderRadius: '6px',
                                        padding: '11px',
                                        color: COLORS.text,
                                        cursor: 'pointer',
                                        textAlign: 'left',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '10px'
                                      }}
                                    >
                                      <div style={{
                                        ...styles.miniAvatar,
                                        flexShrink: 0,
                                        color: computer.Enabled
                                          ? COLORS.gold
                                          : COLORS.danger
                                      }}>
                                        <Monitor size={17} />
                                      </div>

                                      <div style={{
                                        flex: 1,
                                        minWidth: 0
                                      }}>
                                        <div style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: '7px',
                                          flexWrap: 'wrap'
                                        }}>
                                          <strong style={{
                                            fontSize: '12px',
                                            color: computer.Enabled
                                              ? COLORS.text
                                              : COLORS.danger
                                          }}>
                                            {
                                              computer.DisplayName ||
                                              computer.SamAccountName
                                            }
                                          </strong>

                                          <span style={{
                                            fontSize: '9px',
                                            fontWeight: 'bold',
                                            padding: '2px 5px',
                                            borderRadius: '3px',
                                            border: `1px solid ${
                                              computer.Enabled
                                                ? COLORS.success
                                                : COLORS.danger
                                            }`,
                                            color: computer.Enabled
                                              ? COLORS.success
                                              : COLORS.danger
                                          }}>
                                            {
                                              computer.Enabled
                                                ? 'ATIVO'
                                                : 'DESATIVADO'
                                            }
                                          </span>
                                        </div>

                                        <span style={{
                                          display: 'block',
                                          marginTop: '4px',
                                          color: COLORS.muted,
                                          fontSize: '10px',
                                          overflow: 'hidden',
                                          textOverflow: 'ellipsis',
                                          whiteSpace: 'nowrap'
                                        }}>
                                          {computer.OS || 'S.O. não informado'}
                                        </span>

                                        <span style={{
                                          display: 'block',
                                          marginTop: '3px',
                                          color: computer.IPv4 ===
                                            'Offline ou sem DNS'
                                              ? COLORS.warning
                                              : COLORS.muted,
                                          fontSize: '10px',
                                          overflow: 'hidden',
                                          textOverflow: 'ellipsis',
                                          whiteSpace: 'nowrap'
                                        }}>
                                          IP: {computer.IPv4 || 'N/A'}
                                          {' ? '}
                                          {
                                            computer.Description &&
                                            computer.Description !== 'N/A'
                                              ? computer.Description
                                              : 'Sem descrição'
                                          }
                                        </span>
                                      </div>

                                      <ArrowRight
                                        size={16}
                                        color={COLORS.gold}
                                        style={{flexShrink: 0}}
                                      />
                                    </button>
                                  )
                                )}
                              </div>
                            )}
                          </div>

                          <p style={{...styles.sectionLabel, marginTop: '20px'}}>Identidade e Acessos</p>
                          <div style={styles.detailGrid}>
                            <div style={styles.detailItem}><span style={styles.detailLabel}>Status da Conta</span><span style={{...styles.detailValue, color: selectedUser.Enabled ? COLORS.success : COLORS.danger}}>{selectedUser.Enabled ? 'Ativa' : 'Desativada'}</span></div>
                            <div style={styles.detailItem}><span style={styles.detailLabel}>Bloqueado?</span><span style={{...styles.detailValue, color: selectedUser.LockedOut ? COLORS.warning : COLORS.text}}>{selectedUser.LockedOut ? 'Sim' : 'Não'}</span></div>
                            
                            {/* As duas colunas formatadas para alinhar perfeitamente */}
                            <div style={styles.detailItem}><span style={styles.detailLabel}>Senha Nunca Expira?</span><span style={styles.detailValue}>{selectedUser.PasswordNeverExpires ? 'Sim' : 'Não'}</span></div>
                            <div style={styles.detailItem}>
                              <span style={styles.detailLabel}>Última Troca de Senha</span>
                              <span style={{...styles.detailValue, color: selectedUser.pwdLastSet === 0 ? COLORS.warning : COLORS.text}}>
                                {selectedUser.PwdLastSetDate || 'N/A'}
                              </span>
                            </div>

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
                            {/* NOVO CAMPO PERSONALIZADO */}
                            <div style={styles.detailItemFull}>
                              <span style={styles.detailLabel}> JDE Username (ESIJDESSOJdeUserName)</span>
                              <span style={{...styles.detailValue, fontFamily: 'monospace', color: COLORS.gold}}>
                                {selectedUser.ESIJ_User}
                              </span>
                            </div>
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
                  {innerTab === 'grupos' && (() => {
                    // Lógica de Filtro Inteligente (Real-time)
                    const filterStr = groupSearchTerm.toLowerCase();
                    const filteredMembers = isGroup ? (selectedUser.Members || []).filter(m => m.toLowerCase().includes(filterStr)) : [];
                    const filteredMemberOf = !isGroup ? (selectedUser.MemberOf || []).filter(g => g.toLowerCase().includes(filterStr)) : [];

                    return (
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

                        {/* NOVO: ESPELHAMENTO DE PERFIL (CLONE) */}
                        {!isGroup && (
                          <div style={{ ...styles.resetContainer, marginBottom: '15px' }}>
                            <p style={styles.sectionLabel}>Clonagem de Perfil (Espelho de Acessos)</p>
                            <p style={styles.hintText}>Copie os grupos de segurança e distribuição de outro colaborador.</p>
                            <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                              <input
                                type="text"
                                placeholder="Login de origem (Ex: rborges)..."
                                value={cloneSource}
                                onChange={(e) => setCloneSource(e.target.value)}
                                style={styles.inputReset}
                              />
                              <button
                                type="button"
                                onClick={handleCloneGroups}
                                disabled={cloneLoading}
                                style={{ ...styles.actionBtnSuccess, padding: '0 18px', backgroundColor: COLORS.gold, color: COLORS.bg, display: 'flex', alignItems: 'center', gap: '6px' }}
                              >
                                {cloneLoading ? 'Copiando...' : <><Copy size={14}/> Clonar</>}
                              </button>
                            </div>
                          </div>
                        )}

                        {/* NOVO: CAMPO DE BUSCA INTELIGENTE DE GRUPOS */}
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '15px' }}>
                          <div style={{...styles.searchWrapper, flex: 1, padding: '6px 12px'}}>
                            <Search size={16} color={COLORS.muted} style={{marginRight: '8px'}} />
                            <input
                              type="text"
                              placeholder={isGroup ? "Pesquisar membros..." : "Pesquisar grupos de segurança..."}
                              value={groupSearchTerm}
                              onChange={(e) => setGroupSearchTerm(e.target.value)}
                              style={{...styles.input, padding: '4px 0'}}
                            />
                          </div>
                        </div>

                        <div style={styles.listContainer}>
                          {isGroup ? (
                            filteredMembers.length === 0 ? (
                              <p style={styles.hintText}>{selectedUser.Members?.length === 0 ? "Nenhum membro neste grupo." : "Nenhum resultado na pesquisa."}</p>
                            ) : (
                              filteredMembers.map((m, i) => (
                                <div key={i} style={styles.listItem}>
                                  <User size={14} style={{ marginRight: '8px', color: COLORS.muted }} /> {m}
                                </div>
                              ))
                            )
                          ) : filteredMemberOf.length === 0 ? (
                            <p style={styles.hintText}>{selectedUser.MemberOf?.length === 0 ? "Nenhum relacionamento encontrado." : "Nenhum resultado na pesquisa."}</p>
                          ) : (
                            filteredMemberOf.map((g, i) => (
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
                    );
                  })()}

                  {/* ABA DE SEGURANÇA / DIAGNÓSTICO */}
                  {innerTab === 'seguranca' && (
                    <div style={styles.actionSection}>
                      
                      <div style={styles.actionsGrid}>
                        {(isUser || isComputer) && <button onClick={handleOpenEditProfile} style={styles.gridBtn}><Settings size={14} /> Editar Perfil</button>}
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

                      {/* CAIXA DE FERRAMENTAS: MATAR PROCESSO */}
                      {isComputer && (
                        <div style={{ ...styles.resetContainer, marginTop: '15px', boxSizing: 'border-box' }}>
                          <p style={styles.sectionLabel}>Gerenciador de Tarefas Remoto</p>
                          <p style={styles.hintText}>Consulte o PID do travamento no botão de Telemetria (WMI).</p>
                          <div style={{ 
                            display: 'flex', 
                            flexWrap: 'wrap',
                            gap: '8px', 
                            marginTop: '10px' 
                          }}>
                            <input
                              type="text"
                              placeholder="Digite o PID (Ex: 4512)..."
                              value={killPid}
                              onChange={(e) => setKillPid(e.target.value)}
                              style={{...styles.inputReset, flex: '1 1 120px'}}
                            />
                            <button
                              onClick={handleKillProcess}
                              disabled={killLoading}
                              style={{ 
                                ...styles.actionBtnWarning, 
                                flex: '1 1 auto', 
                                padding: '10px', 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center', 
                                gap: '6px' 
                              }}
                            >
                              <Ban size={14}/> {killLoading ? 'Encerrando...' : 'Matar Processo'}
                            </button>
                          </div>
                        </div>
                      )}

                      {isUser && (
                        <div style={styles.dangerZone}>
                          
                          {/* BOTÃO DE DESBLOQUEIO SEMPRE DISPONÍVEL */}
                          <button 
                            onClick={handleUnlock} 
                            style={{ 
                              ...styles.actionBtnWarning, 
                              borderColor: selectedUser.LockedOut ? COLORS.warning : COLORS.border, 
                              color: selectedUser.LockedOut ? COLORS.warning : COLORS.text,
                              marginBottom: '10px'
                            }}
                          >
                            <Unlock size={14}/> {selectedUser.LockedOut ? 'Desbloquear Conta (Bloqueada)' : 'Forçar Desbloqueio'}
                          </button>
                          
                          {/* SWITCH INTERATIVO DE STATUS ISOLADO */}
                          <div style={{ ...styles.resetContainer, marginBottom: '15px', backgroundColor: 'transparent', border: `1px solid ${selectedUser.pwdLastSet === 0 ? COLORS.warning : COLORS.border}` }}>
                            <ToggleSwitch
                              checked={selectedUser.pwdLastSet === 0}
                              onChange={() => handleToggleForceChange()}
                              label="Exigir troca de senha no próximo logon"
                              subLabel={selectedUser.pwdLastSet === 0 ? '🔴 Ativado: O usuário ficará preso na tela de logon.' : '🟢 Desativado: Acesso liberado sem bloqueio.'}
                            />
                          </div>

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
                                <button type="button" onClick={gerarSenhaAleatoria} style={styles.generateBtn}>
                                  Gerar
                                </button>
                              </div>

                              <ToggleSwitch
                                checked={unlockAccount}
                                onChange={setUnlockAccount}
                                label="Desbloquear conta simultaneamente"
                                subLabel="Zera o LockoutTime no Active Directory"
                              />

                              <ToggleSwitch
                                checked={forceChange}
                                onChange={setForceChange}
                                label="Exigir alteração no próximo logon"
                                subLabel="Desmarque se a senha não puder ser expirada na hora"
                              />

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

                  {/* ABA EDITOR DE ATRIBUTOS */}
                  {innerTab === 'atributos' && (
                    <div style={styles.actionSection}>
                      <div style={{ display: 'flex', gap: '8px', marginBottom: '15px' }}>
                        <div style={{...styles.searchWrapper, flex: 1, padding: '6px 12px'}}>
                          <Search size={16} color={COLORS.muted} style={{marginRight: '8px'}} />
                          <input
                            type="text"
                            placeholder="Filtrar atributo (Ex: mail, sAMAccountName, pwdLastSet...)"
                            value={attrSearch}
                            onChange={(e) => setAttrSearch(e.target.value)}
                            style={{...styles.input, padding: '4px 0'}}
                          />
                        </div>
                      </div>

                      <div style={{...styles.listContainer, maxHeight: '400px', overflowY: 'auto'}}>
                        {attrLoading ? (
                          <p style={{...styles.hintText, textAlign: 'center', margin: '20px 0'}}>
                            <div style={styles.spinner}></div> Extraindo matriz completa do Active Directory...
                          </p>
                        ) : attrData ? (
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left', color: COLORS.text }}>
                            <thead>
                              <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                                <th style={{ padding: '10px 8px', color: COLORS.muted }}>Atributo</th>
                                <th style={{ padding: '10px 8px', color: COLORS.muted }}>Valor</th>
                              </tr>
                            </thead>
                            <tbody>
                              {Object.entries(attrData)
                                .filter(([key]) => key.toLowerCase().includes(attrSearch.toLowerCase()))
                                .map(([key, val], idx) => (
                                  <tr key={idx} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                                    <td style={{ padding: '8px', color: COLORS.gold, fontWeight: 'bold', width: '40%', wordBreak: 'break-all' }}>{key}</td>
                                    <td style={{ padding: '8px', wordBreak: 'break-all', fontFamily: 'monospace' }}>
                                      {val || <span style={{color: COLORS.muted}}>N/A</span>}
                                    </td>
                                  </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <p style={styles.hintText}>Nenhum atributo carregado.</p>
                        )}
                      </div>
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
          <div className="bulkWorkspace" style={styles.card}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '12px',
                flexWrap: 'wrap'
              }}
            >
              <div>
                <h3 style={styles.cardTitle}>
                  Objetos em Lote
                </h3>

                <p style={styles.hintText}>
                  Informe logins, matriculas ou hostnames.
                  Valide os objetos antes de executar uma acao.
                </p>
              </div>

              {unifiedBulkValidated && (
                <div className="bulkToolbar"
                  style={{
                    display: 'inline-flex',
                    gap: '5px',
                    padding: '4px',
                    borderRadius: '7px',
                    border: `1px solid ${COLORS.border}`,
                    backgroundColor: COLORS.cell
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setUnifiedBulkView('list')}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '6px 10px',
                      borderRadius: '5px',
                      border: 'none',
                      backgroundColor:
                        unifiedBulkView === 'list'
                          ? COLORS.gold
                          : 'transparent',
                      color:
                        unifiedBulkView === 'list'
                          ? COLORS.bg
                          : COLORS.muted,
                      cursor: 'pointer',
                      fontSize: '11px',
                      fontWeight: '700'
                    }}
                  >
                    <Layers size={13} />
                    Lista
                  </button>

                  <button
                    type="button"
                    onClick={() => setUnifiedBulkView('detail')}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '6px 10px',
                      borderRadius: '5px',
                      border: 'none',
                      backgroundColor:
                        unifiedBulkView === 'detail'
                          ? COLORS.gold
                          : 'transparent',
                      color:
                        unifiedBulkView === 'detail'
                          ? COLORS.bg
                          : COLORS.muted,
                      cursor: 'pointer',
                      fontSize: '11px',
                      fontWeight: '700'
                    }}
                  >
                    <FileText size={13} />
                    Detalhado
                  </button>
                
<span className="bulkToolSep" />
<button type="button" className="bulkTool gold" title="Exportar CSV" aria-label="Exportar CSV" onClick={exportUnifiedBulkCsv} disabled={unifiedBulkLoading || unifiedBulkRunning || unifiedBulkItems.length === 0}><Download size={15} /></button>
<button type="button" className="bulkTool bad" title="Limpar lote" aria-label="Limpar lote" onClick={clearUnifiedBulk} disabled={unifiedBulkLoading || unifiedBulkRunning || (!unifiedBulkInput && unifiedBulkItems.length === 0 && !unifiedBulkResult)}><Trash2 size={15} /></button>
<button type="button" className="bulkTool warn" title="Revalidar falhas" aria-label="Revalidar falhas" onClick={revalidateFailedUnifiedBulkItems} disabled={unifiedBulkLoading || unifiedBulkRunning || !unifiedBulkItems.some(item => !item.valid)}><RefreshCw size={15} /></button>
<span className="bulkToolSep" />
<button type="button" className="bulkTool muted" title="Selecionar todos" aria-label="Selecionar todos" onClick={selectAllUnifiedBulkItems} disabled={unifiedBulkRunning || !unifiedBulkItems.some(item => item.valid && !item.selected)}><ListChecks size={15} /></button>
<button type="button" className="bulkTool muted" title="Limpar selecao" aria-label="Limpar selecao" onClick={clearUnifiedBulkSelection} disabled={unifiedBulkRunning || !unifiedBulkItems.some(item => item.selected)}><X size={15} /></button>
<span className="bulkToolSep" />
<button type="button" className="bulkTool warn" title="Desbloquear usuarios selecionados" aria-label="Desbloquear usuarios selecionados" onClick={() => executeUnifiedBulkAction('unlock')} disabled={unifiedBulkRunning || !unifiedBulkItems.some(item => item.selected && item.type === 'User')}><Unlock size={15} /></button>
<button type="button" className="bulkTool ok" title="Ativar selecionados" aria-label="Ativar selecionados" onClick={() => executeUnifiedBulkAction('enable')} disabled={unifiedBulkRunning || !unifiedBulkItems.some(item => item.selected)}><CheckCircle size={15} /></button>
<button type="button" className="bulkTool bad" title="Desativar selecionados" aria-label="Desativar selecionados" onClick={() => executeUnifiedBulkAction('disable')} disabled={unifiedBulkRunning || !unifiedBulkItems.some(item => item.selected)}><Ban size={15} /></button>
</div>
              )}
            </div>

            {cart.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '10px',
                  marginTop: '14px',
                  marginBottom: '10px',
                  flexWrap: 'wrap'
                }}
              >
                <span
                  style={{
                    color: COLORS.gold,
                    fontSize: '12px',
                    fontWeight: '700'
                  }}
                >
                  {cart.length} item(s) no carrinho
                </span>

                <button
                  type="button"
                  onClick={() => {
                    setUnifiedBulkInput(
                      cart
                        .map(item => item.SamAccountName)
                        .filter(Boolean)
                        .join(', ')
                    );

                    setUnifiedBulkValidated(false);
                    setUnifiedBulkItems([]);
                    setBulkResult(null);
                    setComputerBulkResult(null);
                  }}
                  style={{
                    ...styles.actionBtnSuccess,
                    padding: '6px 12px',
                    fontSize: '11px',
                    display: 'inline-flex',
                    gap: '6px',
                    alignItems: 'center'
                  }}
                >
                  <Layers size={14} />
                  Importar carrinho
                </button>
              </div>
            )}

            <form
              onSubmit={handleUnifiedBulkValidation}
              style={{
                marginTop: '14px'
              }}
            >
              <textarea
                value={unifiedBulkInput}
                onChange={event => {
                  setUnifiedBulkInput(event.target.value);
                  setUnifiedBulkValidated(false);
                  setUnifiedBulkItems([]);
                  setBulkResult(null);
                  setComputerBulkResult(null);
                }}
                onKeyDown={event => {
                  if (
                    event.key === 'Enter'
                    && !event.shiftKey
                  ) {
                    event.preventDefault();
                    handleUnifiedBulkValidation();
                  }
                }}
                placeholder={'joao.silva\n10452\nPTU-NOT-021'}
                style={styles.textArea}
              />

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  marginTop: '10px'
                }}
              >
                <button
                  type="submit"
                  disabled={unifiedBulkLoading}
                  style={{
                    ...styles.actionBtnSuccess,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '7px',
                    padding: '9px 16px'
                  }}
                >
                  {unifiedBulkLoading
                    ? <RefreshCw size={15} />
                    : <Search size={15} />}

                  {unifiedBulkLoading
                    ? `Validando ${unifiedBulkProgress.completed} de ${unifiedBulkProgress.total}`
                    : 'Validar objetos'}
                </button>
              </div>

              {unifiedBulkLoading
                && unifiedBulkProgress.total > 0 && (
                  <div
                    aria-live="polite"
                    style={{
                      marginTop: '10px'
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '10px',
                        marginBottom: '6px',
                        color: COLORS.muted,
                        fontSize: '11px'
                      }}
                    >
                      <span>
                        Validando objetos no diretorio
                      </span>

                      <span>
                        {Math.round(
                          (
                            unifiedBulkProgress.completed
                            / unifiedBulkProgress.total
                          )
                          * 100
                        )}%
                      </span>
                    </div>

                    <div
                      style={{
                        width: '100%',
                        height: '7px',
                        overflow: 'hidden',
                        borderRadius: '999px',
                        border: `1px solid ${COLORS.border}`,
                        backgroundColor: COLORS.cell
                      }}
                    >
                      <div
                        style={{
                          width:
                            `${
                              (
                                unifiedBulkProgress.completed
                                / unifiedBulkProgress.total
                              )
                              * 100
                            }%`,
                          height: '100%',
                          borderRadius: '999px',
                          backgroundColor: COLORS.gold,
                          transition: 'width 0.2s ease'
                        }}
                      />
                    </div>
                  </div>
                )}
            </form>

            {unifiedBulkValidated && (
              <div style={{ marginTop: '18px' }}>
                

                <div className="bulkChips"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    marginBottom: '10px',
                    flexWrap: 'wrap'
                  }}
                >
                  {[
                    {
                      key: 'all',
                      label: 'Todos',
                      count: unifiedBulkItems.length
                    },
                    {
                      key: 'users',
                      label: 'Usuarios',
                      count: unifiedBulkItems.filter(
                        item => item.type === 'User'
                      ).length
                    },
                    {
                      key: 'computers',
                      label: 'Computadores',
                      count: unifiedBulkItems.filter(
                        item => item.type === 'Computer'
                      ).length
                    },
                    {
                      key: 'selected', label: 'Selecionados', count: unifiedBulkItems.filter(item => item.selected).length }, { key: 'invalid',
                      label: 'Nao validados',
                      count: unifiedBulkItems.filter(
                        item => !item.valid
                      ).length
                    }
                  ].filter(chip => chip.key === 'all' || chip.count > 0 || unifiedBulkFilter === chip.key).map(filter => (
                    <button
                      key={filter.key}
                      data-active={unifiedBulkFilter === filter.key ? 'true' : 'false'}
                      type="button"
                      onClick={() =>
                        setUnifiedBulkFilter(filter.key)
                      }
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 10px',
                        borderRadius: '999px',
                        border:
                          `1px solid ${
                            unifiedBulkFilter === filter.key
                              ? COLORS.gold
                              : COLORS.border
                          }`,
                        backgroundColor:
                          unifiedBulkFilter === filter.key
                            ? 'rgba(197, 160, 89, 0.12)'
                            : COLORS.cell,
                        color:
                          unifiedBulkFilter === filter.key
                            ? COLORS.gold
                            : COLORS.muted,
                        cursor: 'pointer',
                        fontSize: '11px',
                        fontWeight: '700'
                      }}
                    >
                      {filter.label}

                      <span
                        style={{
                          minWidth: '18px',
                          padding: '1px 5px',
                          borderRadius: '999px',
                          backgroundColor:
                            unifiedBulkFilter === filter.key
                              ? COLORS.gold
                              : COLORS.border,
                          color:
                            unifiedBulkFilter === filter.key
                              ? COLORS.bg
                              : COLORS.text,
                          fontSize: '10px',
                          textAlign: 'center'
                        }}
                      >
                        {filter.count}
                      </span>
                    </button>
                  ))}
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns:
                      unifiedBulkView === 'detail'
                        ? 'repeat(auto-fit, minmax(250px, 1fr))'
                        : '1fr',
                    gap: '8px'
                  }}
                >
                  {unifiedBulkItems
                    .map((item, index) => ({
                      item,
                      index
                    }))
                    .filter(({ item }) => {
                      if (unifiedBulkFilter === 'users') {
                        return item.type === 'User';
                      }

                      if (unifiedBulkFilter === 'computers') {
                        return item.type === 'Computer';
                      }

                      if (unifiedBulkFilter === 'selected') { return Boolean(item.selected); } if (unifiedBulkFilter === 'invalid') {
                        return !item.valid;
                      }

                      return true;
                    })
                    .map(({ item, index }) => (
                    <div className={'bulkCard ' + (unifiedBulkView === 'detail' ? 'bulkCardDetail' : 'bulkCardList')}
                      key={item.input + '-' + index}
                      style={{
                        display: 'flex',
                        flexDirection:
                          unifiedBulkView === 'detail'
                            ? 'column'
                            : 'row',
                        justifyContent: 'space-between',
                        alignItems:
                          unifiedBulkView === 'detail'
                            ? 'stretch'
                            : 'center',
                        gap: '10px',
                        padding:
                          unifiedBulkView === 'detail'
                            ? '14px'
                            : '9px 10px',
                        borderRadius: '7px',
                        border:
                          `1px solid ${
                            item.valid
                              ? item.selected
                                ? COLORS.success
                                : COLORS.border
                              : COLORS.danger
                          }`,
                        backgroundColor: item.valid
                          ? 'rgba(34, 197, 94, 0.04)'
                          : 'rgba(239, 68, 68, 0.06)'
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '9px',
                          minWidth: 0
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={Boolean(item.selected)}
                          disabled={!item.valid}
                          onChange={() =>
                            toggleUnifiedBulkItem(index)
                          }
                        />

                        <div
                          style={{
                            color: item.valid
                              ? item.type === 'Computer'
                                ? COLORS.success
                                : COLORS.gold
                              : COLORS.danger,
                            flexShrink: 0
                          }}
                        >
                          {item.type === 'Computer'
                            ? <Monitor size={16} />
                            : item.type === 'User'
                              ? <User size={16} />
                              : <AlertTriangle size={16} />}
                        </div>

                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              color: COLORS.text,
                              fontSize: '12px',
                              fontWeight: '700',
                              overflowWrap: 'anywhere'
                            }}
                          >
                            <span className="bulkCopy" title="Copiar" onClick={(e) => { e.stopPropagation(); if (item.displayName) { kadCopyText(item.displayName); } }}>{item.displayName}</span>
                          </div>

                          <div
                            style={{
                              color: COLORS.muted,
                              fontSize: '10px',
                              marginTop: '3px',
                              overflowWrap: 'anywhere'
                            }}
                          >
                            <span className="bulkCopy" title="Copiar" onClick={(e) => { e.stopPropagation(); if (item.id) { kadCopyText(item.id); } }}>{item.id}</span>
                            {' | '}
                            {item.type === 'User'
                              ? 'Usuario'
                              : item.type === 'Computer'
                                ? 'Computador'
                                : 'Nao validado'}
                          </div>

                          {unifiedBulkView === 'detail' && (
                            <div
                              style={{
                                color: item.valid
                                  ? COLORS.muted
                                  : COLORS.danger,
                                fontSize: '11px',
                                marginTop: '8px'
                              }}
                            >
                              {item.valid ? null : item.message}
                              {item.valid && (
                                <div className="bulkTags">
                                  {item.enabled === true && <span className="bulkTag ok">Ativo</span>}
                                  {item.enabled === false && <span className="bulkTag bad">Desativado</span>}
                                  {item.locked && <span className="bulkTag warn">Bloqueado</span>}
                                  <span className="bulkTag muted">
                                    Ultimo logon: {item.ultimoLogon || 'Nao informado'}
                                  </span>
                                </div>
                              )}
                            
                              {item.type === 'User' && (
                                <div
                                  style={{
                                    color: COLORS.muted,
                                    fontSize: '11px',
                                    marginTop: '6px',
                                    display: 'flex',
                                    flexWrap: 'wrap',
                                    gap: '4px 14px'
                                  }}
                                >
                                  <span>
                                    Matricula:{' '}
                                    <span
                                      style={{
                                        color: item.matricula
                                          ? COLORS.text
                                          : COLORS.muted,
                                        fontWeight: '600'
                                      }}
                                    >
                                      <span className="bulkCopy" title="Copiar" onClick={(e) => { e.stopPropagation(); if (item.matricula) { kadCopyText(item.matricula); } }}>{item.matricula || 'Nao informado'}</span>
                                    </span>
                                  </span>

                                  <span>
                                    IGA DIGID:{' '}
                                    <span
                                      style={{
                                        color: item.igaDigid
                                          ? COLORS.text
                                          : COLORS.muted,
                                        fontWeight: '600',
                                        fontFamily: 'monospace'
                                      }}
                                    >
                                      <span className="bulkCopy" title="Copiar" onClick={(e) => { e.stopPropagation(); if (item.igaDigid) { kadCopyText(item.igaDigid); } }}>{item.igaDigid || 'Nao informado'}</span>
                                    </span>
                                  </span>
                                </div>
                              )}
                              {item.type === 'Computer' && (
                                <div
                                  style={{
                                    color: COLORS.muted,
                                    fontSize: '11px',
                                    marginTop: '6px'
                                  }}
                                >
                                  Gerenciado por:{' '}
                                  <span
                                    style={{
                                      color: item.gerenciadoPor
                                        ? COLORS.text
                                        : COLORS.muted,
                                      fontWeight: '600'
                                    }}
                                  >
                                    <span className="bulkCopy" title="Copiar" onClick={(e) => { e.stopPropagation(); if (item.gerenciadoPor) { kadCopyText(item.gerenciadoPor); } }}>{item.gerenciadoPor || 'Nao informado'}</span>
                                  </span>
                                </div>
                              )}
</div>
                          )}
                        </div>
                      </div>

                      <button className="bulkRemove"
                        type="button"
                        onClick={() =>
                          removeUnifiedBulkItem(index)
                        }
                        title="Remover objeto"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          alignSelf:
                            unifiedBulkView === 'detail'
                              ? 'flex-end'
                              : 'center',
                          width: '28px',
                          height: '28px',
                          borderRadius: '6px',
                          border: `1px solid ${COLORS.border}`,
                          backgroundColor: 'transparent',
                          color: COLORS.muted,
                          cursor: 'pointer',
                          flexShrink: 0
                        }}
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ))}

                  {unifiedBulkItems.filter(item => {
                    if (unifiedBulkFilter === 'users') {
                      return item.type === 'User';
                    }

                    if (unifiedBulkFilter === 'computers') {
                      return item.type === 'Computer';
                    }

                    if (unifiedBulkFilter === 'selected') { return Boolean(item.selected); } if (unifiedBulkFilter === 'invalid') {
                      return !item.valid;
                    }

                    return true;
                  }).length === 0 && (
                    <div
                      style={{
                        padding: '18px',
                        borderRadius: '7px',
                        border: `1px dashed ${COLORS.border}`,
                        color: COLORS.muted,
                        fontSize: '12px',
                        textAlign: 'center'
                      }}
                    >
                      Nenhum objeto neste filtro.
                    </div>
                  )}
                </div>

                

                

                <div
                  style={{
                    marginTop: '18px',
                    paddingTop: '14px',
                    borderTop: `1px solid ${COLORS.border}`
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '10px',
                      flexWrap: 'wrap'
                    }}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setUnifiedBulkHistoryOpen(
                          previous => !previous
                        )
                      }
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '7px',
                        padding: '7px 11px',
                        borderRadius: '6px',
                        border: `1px solid ${COLORS.border}`,
                        backgroundColor: COLORS.cell,
                        color: COLORS.text,
                        cursor: 'pointer',
                        fontSize: '11px',
                        fontWeight: '700'
                      }}
                    >
                      <FileText size={14} />

                      Historico de lotes

                      <span
                        style={{
                          minWidth: '19px',
                          padding: '1px 5px',
                          borderRadius: '999px',
                          backgroundColor: COLORS.gold,
                          color: COLORS.bg,
                          fontSize: '10px',
                          textAlign: 'center'
                        }}
                      >
                        {unifiedBulkHistory.length}
                      </span>
                    </button>

                    {unifiedBulkHistory.length > 0 && (
                      <div
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          flexWrap: 'wrap'
                        }}
                      >
                        <button
                          type="button"
                          onClick={exportUnifiedBulkHistoryCsv}
                          title="Exportar historico em CSV"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '7px 10px',
                            borderRadius: '6px',
                            border: `1px solid ${COLORS.gold}`,
                            backgroundColor: 'transparent',
                            color: COLORS.gold,
                            cursor: 'pointer',
                            fontSize: '11px',
                            fontWeight: '700'
                          }}
                        >
                          <FileText size={13} />
                          Exportar historico
                        </button>

                        <button
                          type="button"
                          onClick={clearUnifiedBulkHistory}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '7px 10px',
                          borderRadius: '6px',
                          border: `1px solid ${COLORS.danger}`,
                          backgroundColor: 'transparent',
                          color: COLORS.danger,
                          cursor: 'pointer',
                          fontSize: '11px',
                          fontWeight: '700'
                        }}
                      >
                          <Trash2 size={13} />
                          Limpar historico
                        </button>
                      </div>
                    )}
                  </div>

                  {unifiedBulkHistoryOpen && (
                    <div
                      style={{
                        display: 'grid',
                        gap: '8px',
                        marginTop: '12px',
                        maxHeight: '320px',
                        overflowY: 'auto'
                      }}
                    >
                      {unifiedBulkHistory.length === 0 ? (
                        <div
                          style={{
                            padding: '16px',
                            borderRadius: '7px',
                            border: `1px dashed ${COLORS.border}`,
                            color: COLORS.muted,
                            fontSize: '12px',
                            textAlign: 'center'
                          }}
                        >
                          Nenhuma execucao registrada.
                        </div>
                      ) : (
                        unifiedBulkHistory.map(entry => (
                          <div
                            key={entry.id}
                            style={{
                              display: 'grid',
                              gridTemplateColumns:
                                'minmax(150px, 1.5fr) repeat(5, minmax(65px, 1fr))',
                              gap: '8px',
                              alignItems: 'center',
                              padding: '10px',
                              borderRadius: '7px',
                              border: `1px solid ${COLORS.border}`,
                              backgroundColor: COLORS.cell,
                              overflowX: 'auto'
                            }}
                          >
                            <div>
                              <div
                                style={{
                                  color: COLORS.gold,
                                  fontSize: '11px',
                                  fontWeight: '700'
                                }}
                              >
                                {entry.action}
                              </div>

                              <div
                                style={{
                                  color: COLORS.muted,
                                  fontSize: '10px',
                                  marginTop: '3px'
                                }}
                              >
                                {entry.dateTime}
                              </div>
                            </div>

                            {[
                              {
                                label: 'Total',
                                value: entry.total,
                                color: COLORS.text
                              },
                              {
                                label: 'Sucessos',
                                value: entry.success,
                                color: COLORS.success
                              },
                              {
                                label: 'Falhas',
                                value: entry.failed,
                                color: COLORS.danger
                              },
                              {
                                label: 'Usuarios',
                                value: entry.users,
                                color: COLORS.gold
                              },
                              {
                                label: 'Computadores',
                                value: entry.computers,
                                color: COLORS.success
                              }
                            ].map(metric => (
                              <div key={metric.label}>
                                <div
                                  style={{
                                    color: COLORS.muted,
                                    fontSize: '9px'
                                  }}
                                >
                                  {metric.label}
                                </div>

                                <div
                                  style={{
                                    color: metric.color,
                                    fontSize: '13px',
                                    fontWeight: '700',
                                    marginTop: '2px'
                                  }}
                                >
                                  {metric.value}
                                </div>
                              </div>
                            ))}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {unifiedBulkResult && (() => {
                  const all = unifiedBulkResult.results || [];
                  const ok = all.filter(i => i.success).length;
                  const bad = all.length - ok;
                  const f = (bulkResultFilter === 'failed' && bad === 0) || (bulkResultFilter === 'success' && ok === 0) ? 'all' : bulkResultFilter;
                  const shown = all.filter(i => f === 'success' ? i.success : f === 'failed' ? !i.success : true);
                  const chips = [
                    { k: 'all', l: 'Todos', n: all.length },
                    { k: 'success', l: 'Sucesso', n: ok },
                    { k: 'failed', l: 'Falhas', n: bad }
                  ].filter(c => c.k === 'all' || c.n > 0);
                  return (
                    <div className="bulkResult">
                      <div className="bulkResultHead">
                        <div>
                          <div className="bulkResultTitle" data-state={bad === 0 ? 'ok' : 'warn'}>Processados: {ok} de {all.length}</div>
                          <div className="bulkResultSub">{unifiedBulkResult.action || 'Execucao'}</div>
                        </div>
                        <div className="bulkResultTools">
                          <button type="button" className="bulkTool gold" title="Exportar CSV" aria-label="Exportar CSV" onClick={() => kadExportBulkResultCsv(unifiedBulkResult)}><Download size={15} /></button>
                          <button type="button" className="bulkTool muted" title="Fechar resultado" aria-label="Fechar resultado" onClick={() => setUnifiedBulkResult(null)}><X size={15} /></button>
                        </div>
                      </div>
                      <div className="bulkChips">
                        {chips.map(c => (
                          <button key={c.k} type="button" data-active={f === c.k ? 'true' : 'false'} onClick={() => setBulkResultFilter(c.k)}>{c.l}<span>{c.n}</span></button>
                        ))}
                      </div>
                      <div className="bulkResGrid">
                        {shown.map((i, x) => (
                          <div key={i.id + '-r-' + x} className={'bulkResRow ' + (i.success ? 'ok' : 'bad')}>
                            <span className="bulkResIcon">{i.type === 'Computer' ? <Monitor size={15} /> : <User size={15} />}</span>
                            <div className="bulkResBody">
                              <div className="bulkResId">{i.id}</div>
                              <div className="bulkResMsg">{i.message}</div>
                            </div>
                            <span className={'bulkTag ' + (i.success ? 'ok' : 'bad')}>{i.success ? 'Sucesso' : 'Falha'}</span>
                          </div>
                        ))}
                        {shown.length === 0 && <div className="bulkResEmpty">Nenhum item neste filtro.</div>}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        )}

        {/* ================= ABA 3: COMPARADOR ================= */}
        {activeTab === 'compare' && (
          <div className="bulkWorkspace cmpWorkspace" style={styles.card}>
            <div className="cmpHead">
              <div>
                <h3 style={styles.cardTitle}>Matriz de Permissões</h3>
                <p style={styles.hintText}>Avalie divergências em políticas de segurança.</p>
              </div>
              {(<div className="cmpActions"><button type="button" className="bulkTool gold" title="Importar carrinho" aria-label="Importar carrinho" disabled={cart.length === 0} onClick={() => { const names = cart.map(i => i.SamAccountName).filter(Boolean); if (names.length < 2) { toast.error("Adicione ao menos 2 itens ao carrinho."); return; } setCompareInput(names.join(", ")); }}><Layers size={15} /></button>{compareResult && (<button type="button" className="bulkTool gold" title="Exportar CSV" aria-label="Exportar CSV" onClick={() => kadExportCompareCsv(compareResult)}><Download size={15} /></button>)}
                  <button
                    type="button"
                    className="bulkTool bad"
                    title="Limpar comparacao"
                    aria-label="Limpar comparacao"
                    onClick={() => { setCompareResult(null); setCompareInput(''); }}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              )}
            </div>

            <div className="cmpSearch">
              <Users size={16} className="cmpSearchIcon" />
              <input
                type="text"
                placeholder="Logins separados por virgula..."
                value={compareInput}
                onChange={(e) => setCompareInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { handleCompare(); } }}
              />
              <button
                type="button"
                className="cmpGo"
                onClick={handleCompare}
                disabled={compareLoading}
                title="Comparar"
                aria-label="Comparar"
              >
                {compareLoading ? <div style={styles.spinner}></div> : <Scale size={17} />}
              </button>
            </div>

            {compareResult && (
              <div>
                <div className="cmpChips">
                  <span className="cmpChip ok">
                    <CheckCircle size={12} /> Em comum <b>{(compareResult.common_groups || []).length}</b>
                  </span>
                  {Object.keys(compareResult.users || {}).map((username) => (
                    <span key={username} className="cmpChip gold">
                      <User size={12} /> {username.toUpperCase()} <b>{((compareResult.users[username] || {}).ExclusiveGroups || []).length}</b>
                    </span>
                  ))}
                </div>

                <div className="cmpFilter"><Search size={14} /><input type="text" placeholder="Filtrar grupos..." value={compareSearch} onChange={(e) => setCompareSearch(e.target.value)} />{compareSearch && (<button type="button" className="bulkTool muted" title="Limpar filtro" aria-label="Limpar filtro" onClick={() => setCompareSearch("")}><X size={14} /></button>)}</div>
                <div className="cmpGrid">
                  <div className="cmpCard ok">
                    <div className="cmpCardHead">
                      <div className="cmpCardTitle"><CheckCircle size={14} /> Conformidade (em comum)</div>
                      <button
                        type="button"
                        className="bulkTool gold"
                        title="Copiar lista"
                        aria-label="Copiar lista"
                        onClick={() => kadCopyText((compareResult.common_groups || []).join('\n'))}
                      >
                        <Copy size={14} />
                      </button>
                    </div>
                    <div className="cmpList">
                      {(compareResult.common_groups || []).length === 0 ? (
                        <div className="cmpEmpty">Nenhum grupo em comum.</div>
                      ) : (
                        kadFilterList(compareResult.common_groups || [], compareSearch).map((g, idx) => (<div key={idx} className="cmpItem">{g}</div>
                        ))
                      )}
                    </div>
                  </div>

                  {Object.keys(compareResult.users || {}).map((username) => {
                    const groups = (compareResult.users[username] || {}).ExclusiveGroups || [];
                    return (
                      <div key={username} className="cmpCard gold">
                        <div className="cmpCardHead">
                          <div className="cmpCardTitle"><User size={14} /> {username.toUpperCase()}</div>
                          <button
                            type="button"
                            className="bulkTool gold"
                            title="Copiar lista"
                            aria-label="Copiar lista"
                            onClick={() => kadCopyText(groups.join('\n'))}
                          >
                            <Copy size={14} />
                          </button>
                        </div>
                        <div className="cmpList">
                          {groups.length === 0 ? (
                            <div className="cmpEmpty">Sem grupos exclusivos.</div>
                          ) : (
                            kadFilterList(groups, compareSearch).map((g, i) => (<div key={i} className="cmpItem">{g}</div>
                            ))
                          )}
                        </div>
                      </div>
                    );
                  })}
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
          <div className="vetorhWorkspace" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
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
                          <span style={styles.detailValue}><span className="vtCopy" title="Copiar" onClick={() => kadCopyText(vetorhSearchResult[0].networkid)}>{vetorhSearchResult[0].networkid || 'N/A'}</span></span>
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
                          <span style={{...styles.detailValue, fontFamily: 'monospace'}}><span className="vtCopy" title="Copiar" onClick={() => kadCopyText(vetorhSearchResult[0].igadigid)}>{vetorhSearchResult[0].igadigid}</span></span>
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
                                   <td style={{ padding: '8px' }}><span className="vtCopy" title="Copiar" onClick={() => kadCopyText(row.numcad)}>{row.numcad}</span></td>
                                   <td style={{ padding: '8px', fontWeight: 'bold' }}>{row.nomfun}</td>
                                   <td style={{ padding: '8px', color: row.sitafa.includes('Trabalhando') ? COLORS.success : row.sitafa.includes('Demitido') ? COLORS.danger : COLORS.warning }}>{row.sitafa}</td>
                                   <td style={{ padding: '8px', color: COLORS.gold, fontWeight: 'bold' }}>{row.techacc}</td>
                                   <td style={{ padding: '8px', fontFamily: 'monospace' }}><span className="vtCopy" title="Copiar" onClick={() => kadCopyText(row.igadigid)}>{row.igadigid || 'N/A'}</span></td>
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
              
              {/* BOTÃO MÁGICO DO CARRINHO VETORH */}
              {cart.length > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <span style={{ color: COLORS.gold, fontSize: '12px', fontWeight: 'bold' }}>🛒 {cart.length} item(s) no carrinho</span>
                  <button 
                    onClick={() => {
                      const mats = cart.map(i => i.EmployeeID).filter(m => m && m !== 'N/A' && m !== 'Não informado');
                      if (mats.length === 0) return toast.error('Nenhum usuário no carrinho possui matrícula no AD.');
                      setVetorhDirectInput(mats.join(', '));
                      toast.success(`${mats.length} matrículas importadas!`);
                    }} 
                    style={{ ...styles.actionBtnSuccess, padding: '6px 12px', fontSize: '11px', display: 'flex', gap: '6px', alignItems: 'center' }}
                  >
                    <Database size={14}/> Importar Matrículas
                  </button>
                </div>
              )}

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
                          <li key={idx}><strong>Matrícula {err.matricula}:</strong> {err.error}</li>
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
            <p
              style={{
                color: COLORS.text,
                fontSize: '13px',
                marginBottom: '15px',
                lineHeight: '1.5',
                whiteSpace: 'pre-line'
              }}
            >
              {confirmConfig.message}
            </p>
            
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

      {/* MODAL: VISOR DE HISTÓRICO DE AUDITORIA (LOGS ESTRUTURADOS) */}
      {modalAuditOpen && (
        <div style={styles.modalOverlay}>
          <div style={{...styles.modalContent, maxWidth: '800px', width: '95%'}}>
            <h3 style={{color: COLORS.gold, margin: '0 0 15px 0', display: 'flex', alignItems: 'center', gap: '8px'}}>
              <FileText size={18}/> Auditoria de Plantão (Últimos 50 registros)
            </h3>
            
            {auditLoading ? (
              <div style={{color: COLORS.gold, padding: '20px', textAlign: 'center'}}>Carregando log de eventos do Banco de Dados...</div>
            ) : (
              <div style={{maxHeight: '400px', overflowY: 'auto', overflowX: 'auto', borderRadius: '6px', border: `1px solid ${COLORS.border}`}}>
                {auditLogs.length === 0 ? (
                  <p style={{...styles.hintText, padding: '20px', textAlign: 'center'}}>Nenhum log registrado ainda.</p>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', textAlign: 'left', color: COLORS.text, whiteSpace: 'nowrap' }}>
                    <thead style={{ backgroundColor: COLORS.frame, position: 'sticky', top: 0, zIndex: 1 }}>
                      <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                        <th style={{ padding: '10px', color: COLORS.muted }}>Data/Hora</th>
                        <th style={{ padding: '10px', color: COLORS.muted }}>Operador</th>
                        <th style={{ padding: '10px', color: COLORS.gold }}>Ação</th>
                        <th style={{ padding: '10px', color: COLORS.muted }}>Alvo (Objeto)</th>
                        <th style={{ padding: '10px', color: COLORS.muted }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditLogs.map((log, idx) => (
                        <tr key={idx} style={{ borderBottom: `1px solid ${COLORS.border}`, backgroundColor: idx % 2 === 0 ? 'transparent' : COLORS.cell }}>
                          <td style={{ padding: '10px' }}>{log.data_hora}</td>
                          <td style={{ padding: '10px', fontWeight: 'bold' }}>{log.operador}</td>
                          <td style={{ padding: '10px', color: COLORS.gold }}>{log.acao}</td>
                          <td style={{ padding: '10px' }}>{log.alvo}</td>
                          <td style={{ 
                            padding: '10px', 
                            fontWeight: 'bold',
                            color: log.status.includes('SUCESSO') ? COLORS.success : log.status.includes('FALHA') ? COLORS.danger : COLORS.warning 
                          }}>
                            {log.status}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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
          <div style={{
            ...styles.modalContent,
            maxWidth: '520px',
            maxHeight: '90vh',
            overflowY: 'auto'
          }}>
            <h3 style={{
              color: COLORS.gold,
              margin: '0 0 15px 0'
            }}>
              Atualização de Registro
            </h3>

            <span style={styles.detailLabel}>
              Descrição
            </span>

            <textarea
              value={editData.description}
              onChange={e => setEditData({
                ...editData,
                description: e.target.value
              })}
              placeholder="Descrição do objeto no Active Directory"
              maxLength={1024}
              style={{
                ...styles.textArea,
                height: '80px',
                marginTop: 0,
                marginBottom: '12px'
              }}
            />

            <span style={styles.detailLabel}>
              Cargo
            </span>

            <input
              type="text"
              value={editData.title}
              onChange={e => setEditData({
                ...editData,
                title: e.target.value
              })}
              style={styles.modalInput}
              placeholder="Cargo"
            />

            <span style={{
              ...styles.detailLabel,
              marginTop: '12px'
            }}>
              Departamento
            </span>

            <input
              type="text"
              value={editData.department}
              onChange={e => setEditData({
                ...editData,
                department: e.target.value
              })}
              style={styles.modalInput}
              placeholder="Departamento"
            />

            <span style={{
              ...styles.detailLabel,
              marginTop: '12px'
            }}>
              Telefone
            </span>

            <input
              type="text"
              value={editData.telephone}
              onChange={e => setEditData({
                ...editData,
                telephone: e.target.value
              })}
              style={styles.modalInput}
              placeholder="Telefone"
            />

            <div style={{
              ...styles.resetContainer,
              marginTop: '15px'
            }}>
              <p style={styles.sectionLabel}>
                {isComputer ? 'Gerenciado Por' : 'Gerente Direto'}
              </p>

              {editData.manager_label ? (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '10px',
                  padding: '10px',
                  marginBottom: '10px',
                  backgroundColor: COLORS.bg,
                  border: `1px solid ${COLORS.success}`,
                  borderRadius: '4px'
                }}>
                  <div style={{minWidth: 0}}>
                    <span style={{
                      ...styles.detailValue,
                      color: COLORS.success
                    }}>
                      {editData.manager_label}
                    </span>

                    {editData.manager_dn && (
                      <span style={{
                        display: 'block',
                        marginTop: '4px',
                        color: COLORS.muted,
                        fontSize: '10px',
                        wordBreak: 'break-all'
                      }}>
                        {editData.manager_dn}
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={handleClearManager}
                    style={styles.removeGroupBtn}
                    title="Remover gerente"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ) : (
                <p style={{
                  ...styles.hintText,
                  marginTop: 0
                }}>
                  Nenhum gerente definido.
                </p>
              )}

              <div style={{
                display: 'flex',
                gap: '8px'
              }}>
                <input
                  type="text"
                  value={managerSearch}
                  onChange={e => {
                    setManagerSearch(e.target.value);
                    setManagerResults([]);
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSearchManager();
                    }
                  }}
                  style={styles.inputReset}
                  placeholder={
                    isComputer
                      ? 'Nome ou login do responsavel'
                      : 'Nome ou login do gerente'
                  }
                />

                <button
                  type="button"
                  onClick={handleSearchManager}
                  disabled={managerLoading}
                  style={{
                    ...styles.actionBtnSuccess,
                    padding: '0 16px'
                  }}
                  title="Pesquisar gerente no AD"
                >
                  {managerLoading
                    ? '...'
                    : <Search size={16} />
                  }
                </button>
              </div>

              {managerResults.length > 0 && (
                <div style={{
                  ...styles.listContainer,
                  marginTop: '10px',
                  maxHeight: '180px'
                }}>
                  {managerResults.map(manager => (
                    <button
                      key={manager.DN}
                      type="button"
                      onClick={() =>
                        handleSelectManager(manager)
                      }
                      style={{
                        ...styles.listItem,
                        width: '100%',
                        cursor: 'pointer',
                        textAlign: 'left',
                        justifyContent: 'space-between'
                      }}
                    >
                      <span>
                        <strong>
                          {manager.DisplayName}
                        </strong>

                        <span style={{
                          display: 'block',
                          marginTop: '3px',
                          color: COLORS.muted,
                          fontSize: '10px'
                        }}>
                          {manager.SamAccountName}
                          {manager.EmployeeID
                            ? ` • Matrícula: ${manager.EmployeeID}`
                            : ''
                          }
                        </span>
                      </span>

                      <ArrowRight
                        size={15}
                        color={COLORS.gold}
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div style={styles.modalActions}>
              <button
                type="button"
                onClick={() => {
                  setModalEditOpen(false);
                  setManagerSearch('');
                  setManagerResults([]);
                }}
                disabled={profileLoading}
                style={styles.modalCancelBtn}
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={handleSaveProfile}
                disabled={profileLoading}
                style={{
                  ...styles.modalSaveBtn,
                  opacity: profileLoading ? 0.6 : 1
                }}
              >
                {profileLoading
                  ? 'Aplicando...'
                  : 'Aplicar'
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: MOVER OU (TREE VIEW) */}
      {modalMoveOpen && (
        <div style={styles.modalOverlay}>
          <div style={{...styles.modalContent, maxWidth: '600px'}}>
            <h3 style={{color: COLORS.gold, margin: '0 0 10px 0'}}>Movimentação Estrutural</h3>
            <p style={{color: COLORS.muted, fontSize: '12px', marginBottom: '15px'}}>Expanda as pastas e selecione o destino organizacional (OU):</p>
            
            {/* CONTAINER DA ÁRVORE (Com fundo escuro, bordas e barra de rolagem) */}
            <div style={{ 
              backgroundColor: COLORS.frame, 
              border: `1px solid ${COLORS.border}`, 
              borderRadius: '6px', 
              padding: '15px', 
              height: '350px', 
              overflowY: 'auto', 
              overflowX: 'auto', 
              marginBottom: '20px' 
            }}>
              {loadingOus ? (
                <p style={{color: COLORS.gold, fontSize: '13px', textAlign: 'center', marginTop: '100px'}}>⏳ Desenhando estrutura do AD...</p>
              ) : treeData.length > 0 ? (
                treeData.map((node, idx) => (
                  <TreeNode key={idx} node={node} selectedDn={selectedOu} onSelect={setSelectedOu} />
                ))
              ) : (
                <p style={{color: COLORS.danger, fontSize: '13px'}}>Nenhuma estrutura localizada.</p>
              )}
            </div>

            <div style={styles.modalActions}>
              <button onClick={() => setModalMoveOpen(false)} style={styles.modalCancelBtn}>Cancelar</button>
              <button 
                onClick={handleMoveOu} 
                disabled={!selectedOu || loadingOus} 
                style={{
                  ...styles.modalSaveBtn, 
                  opacity: selectedOu ? 1 : 0.4, 
                  backgroundColor: COLORS.warning 
                }}
              >
                Confirmar Roteamento
              </button>
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

      {/* MODAL CUSTOMIZADO DE CONFIRMAÇÃO (TOAST) */}
      {confirmDialog.isOpen && (
        <div style={styles.modalOverlay}>
          <div style={{...styles.modalContent, border: `1px solid ${COLORS.gold}`, maxWidth: '350px'}}>
            <h3 style={{color: COLORS.gold, margin: '0 0 10px 0', fontSize: '16px'}}>
              ⚠️ {confirmDialog.title}
            </h3>
            <p style={{color: COLORS.text, fontSize: '14px', lineHeight: '1.4', marginBottom: '25px'}}>
              {confirmDialog.message}
            </p>
            
            <div style={styles.modalActions}>
              <button 
                onClick={() => setConfirmDialog({ ...confirmDialog, isOpen: false })} 
                style={styles.modalCancelBtn}
              >
                Cancelar
              </button>
              <button 
                onClick={confirmDialog.onConfirm} 
                style={styles.modalSaveBtn}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ESTILOS CORPORATIVOS
const kadExportBulkResultCsv = (result) => {
  const rows = result && result.results ? result.results : [];
  if (rows.length === 0) { toast.error('Nao ha resultado para exportar.'); return; }
  const clean = (v) => {
    let c = String(v === undefined || v === null ? '' : v).replace(/\r?\n/g, ' ');
    if (/^[=+\-@]/.test(c)) { c = "'" + c; }
    return '"' + c.replace(/"/g, '""') + '"';
  };
  const when = result.executedAt ? new Date(result.executedAt) : new Date();
  const lines = [['Data', 'Acao', 'Objeto', 'Tipo', 'Situacao', 'Mensagem'].map(clean).join(';')];
  rows.forEach((i) => {
    lines.push([when.toLocaleString('pt-BR'), result.action || '', i.id, i.type === 'Computer' ? 'Computador' : 'Usuario', i.success ? 'Sucesso' : 'Falha', i.message].map(clean).join(';'));
  });
  const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'kad_bulk_resultado_' + when.toISOString().slice(0, 19).replace(/[-:T]/g, '') + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast.success(rows.length + ' item(ns) exportado(s).');
};

const kadFilterList = (list, term) => {
  const q = String(term || '').trim().toLowerCase();
  return q ? list.filter((g) => String(g).toLowerCase().includes(q)) : list;
};

const kadExportCompareCsv = (result) => {
  const clean = (v) => {
    let c = String(v === undefined || v === null ? '' : v);
    if (/^[=+\-@]/.test(c)) { c = "'" + c; }
    return '"' + c.replace(/"/g, '""') + '"';
  };
  const lines = [['Tipo', 'Usuario', 'Grupo'].map(clean).join(';')];
  (result.common_groups || []).forEach((g) => lines.push(['Em comum', 'Todos', g].map(clean).join(';')));
  Object.keys(result.users || {}).forEach((u) => {
    ((result.users[u] || {}).ExclusiveGroups || []).forEach((g) => lines.push(['Exclusivo', u, g].map(clean).join(';')));
  });
  if (lines.length < 2) { toast.error('Nada para exportar.'); return; }
  const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'kad_compare_' + new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '') + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast.success((lines.length - 1) + ' linha(s) exportada(s).');
};

const kadCopyText = (value) => {
  if (navigator.clipboard && value) {
    navigator.clipboard.writeText(value).then(() => toast.success('Copiado.'));
  } else {
    toast.error('Nada para copiar ou copia indisponivel.');
  }
};

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

const styleSheet = document.createElement("style");

styleSheet.innerText = `
@keyframes spin {
  100% {
    transform: rotate(360deg);
  }
}

@keyframes bulkReveal {
  from {
    opacity: 0;
    transform: translateY(5px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* KAD BULK VISUAL START */
.bulkWorkspace {
  position: relative;
  overflow: hidden;
  padding: 18px !important;
  border-color: rgba(197, 160, 89, 0.24) !important;
  background:
    radial-gradient(
      circle at top right,
      rgba(197, 160, 89, 0.09),
      transparent 32%
    ),
    #161F32 !important;
}

.bulkWorkspace::before {
  content: "";
  position: absolute;
  top: 0;
  left: 18px;
  right: 18px;
  height: 2px;
  border-radius: 999px;
  background: linear-gradient(
    90deg,
    transparent,
    #C5A059,
    transparent
  );
  pointer-events: none;
}

.bulkWorkspace h3 {
  letter-spacing: 0.01em;
}

.bulkWorkspace textarea {
  min-height: 104px !important;
  max-height: 240px;
  margin-top: 8px !important;
  border-radius: 8px !important;
  border-color: rgba(148, 163, 184, 0.22) !important;
  background-color: rgba(11, 17, 30, 0.76) !important;
  line-height: 1.55;
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    background-color 0.18s ease;
}

.bulkWorkspace textarea:hover {
  border-color: rgba(197, 160, 89, 0.48) !important;
}

.bulkWorkspace textarea:focus {
  border-color: #C5A059 !important;
  background-color: #0B111E !important;
  box-shadow: 0 0 0 3px rgba(197, 160, 89, 0.12);
}

.bulkWorkspace button {
  min-height: 32px;
  transition:
    transform 0.14s ease,
    filter 0.14s ease,
    opacity 0.14s ease;
}

.bulkWorkspace button:not(:disabled):hover {
  transform: translateY(-1px);
  filter: brightness(1.08);
}

.bulkWorkspace button:not(:disabled):active {
  transform: translateY(0);
}

.bulkWorkspace button:focus-visible {
  outline: 2px solid rgba(197, 160, 89, 0.92);
  outline-offset: 2px;
}

.bulkWorkspace button:disabled {
  cursor: not-allowed !important;
  opacity: 0.48 !important;
}

.bulkWorkspace input[type="checkbox"] {
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: #C5A059;
  cursor: pointer;
  flex-shrink: 0;
}

.bulkWorkspace input[type="checkbox"]:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.bulkWorkspace div[style*="repeat(auto-fit, minmax(140px, 1fr))"] > div {
  min-height: 64px;
  padding: 9px 11px !important;
  border-color: rgba(148, 163, 184, 0.16) !important;
  background-color: rgba(18, 24, 36, 0.82) !important;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.025);
  transition:
    border-color 0.16s ease,
    transform 0.16s ease;
}

.bulkWorkspace div[style*="repeat(auto-fit, minmax(140px, 1fr))"] > div:hover {
  border-color: rgba(197, 160, 89, 0.34) !important;
  transform: translateY(-1px);
}

.bulkWorkspace div[style*="rgba(34, 197, 94, 0.04)"],
.bulkWorkspace div[style*="rgba(239, 68, 68, 0.06)"] {
  transition:
    border-color 0.16s ease,
    background-color 0.16s ease,
    transform 0.16s ease;
}

.bulkWorkspace div[style*="rgba(34, 197, 94, 0.04)"]:hover,
.bulkWorkspace div[style*="rgba(239, 68, 68, 0.06)"]:hover {
  transform: translateY(-1px);
  background-color: rgba(18, 24, 36, 0.94) !important;
}

.bulkWorkspace div[style*="repeat(auto-fit, minmax(250px, 1fr))"] > div {
  min-height: 104px;
}

.bulkWorkspace div[style*="margin-top: 18px"] {
  animation: bulkReveal 0.18s ease-out;
}

.bulkWorkspace div[style*="border: 1px dashed"] {
  background-color: rgba(18, 24, 36, 0.58);
}

.bulkWorkspace div[style*="display: inline-flex"] {
  max-width: 100%;
}

.bulkWorkspace div[style*="display: inline-flex"] button {
  white-space: nowrap;
}

@media (max-width: 640px) {
  .bulkWorkspace {
    padding: 14px !important;
    border-radius: 10px !important;
  }

  .bulkWorkspace::before {
    left: 14px;
    right: 14px;
  }

  .bulkWorkspace textarea {
    min-height: 96px !important;
  }

  .bulkWorkspace div[style*="repeat(auto-fit, minmax(140px, 1fr))"] {
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
  }

  .bulkWorkspace div[style*="repeat(auto-fit, minmax(250px, 1fr))"] {
    grid-template-columns: 1fr !important;
  }

  .bulkWorkspace div[style*="display: inline-flex"] {
    width: 100%;
  }

  .bulkWorkspace div[style*="display: inline-flex"] button {
    flex: 1;
    justify-content: center;
  }

  .bulkWorkspace button {
    min-height: 36px;
  }
}

@media (max-width: 410px) {
  .bulkWorkspace div[style*="repeat(auto-fit, minmax(140px, 1fr))"] {
    grid-template-columns: 1fr !important;
  }

  .bulkWorkspace div[style*="display: inline-flex"] {
    display: grid !important;
    grid-template-columns: 1fr 1fr;
  }
}

/* KAD BULK TOOLS START */
.bulkWorkspace .bulkToolbar {
  flex-wrap: wrap !important;
  align-items: center !important;
  gap: 4px !important;
  max-width: 100%;
}
.bulkWorkspace .bulkToolSep {
  width: 1px;
  height: 18px;
  margin: 0 4px;
  background: rgba(148, 163, 184, 0.28);
  flex-shrink: 0;
}
.bulkWorkspace .bulkTool {
  width: 30px;
  min-width: 30px;
  height: 30px;
  min-height: 30px;
  padding: 0 !important;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 5px;
  background: transparent;
  cursor: pointer;
  flex-shrink: 0;
}
.bulkWorkspace .bulkTool.gold { color: #C5A059; }
.bulkWorkspace .bulkTool.ok { color: #10B981; }
.bulkWorkspace .bulkTool.warn { color: #F59E0B; }
.bulkWorkspace .bulkTool.bad { color: #EF4444; }
.bulkWorkspace .bulkTool.muted { color: #94A3B8; }
.bulkWorkspace .bulkTool:hover:not(:disabled) {
  background: rgba(148, 163, 184, 0.16);
  transform: none;
  filter: none;
}
.bulkWorkspace .bulkTool.gold:hover:not(:disabled) { background: rgba(197, 160, 89, 0.18); }
.bulkWorkspace .bulkTool.ok:hover:not(:disabled) { background: rgba(16, 185, 129, 0.16); }
.bulkWorkspace .bulkTool.warn:hover:not(:disabled) { background: rgba(245, 158, 11, 0.16); }
.bulkWorkspace .bulkTool.bad:hover:not(:disabled) { background: rgba(239, 68, 68, 0.16); }
.bulkWorkspace .bulkTool:disabled {
  opacity: 0.32;
  cursor: not-allowed;
}
@media (max-width: 640px) {
  .bulkWorkspace .bulkTool {
    width: 34px;
    min-width: 34px;
    height: 34px;
    min-height: 34px;
  }
}
/* KAD BULK TOOLS END */

/* KAD BULK CHIPS START */
.bulkWorkspace .bulkChips {
  display: flex !important;
  flex-wrap: nowrap !important;
  align-items: center !important;
  gap: 2px !important;
  width: fit-content;
  max-width: 100%;
  margin-bottom: 12px !important;
  padding: 3px !important;
  overflow-x: auto;
  scrollbar-width: none;
  border: 1px solid #24324D;
  border-radius: 8px;
  background: rgba(11, 17, 30, 0.55);
}
.bulkWorkspace .bulkChips::-webkit-scrollbar {
  display: none;
}
.bulkWorkspace .bulkChips > button {
  flex-shrink: 0;
  min-height: 26px !important;
  padding: 3px 10px !important;
  gap: 6px !important;
  border: none !important;
  border-radius: 6px !important;
  background: transparent !important;
  color: #94A3B8 !important;
  font-size: 11px !important;
  white-space: nowrap;
  transform: none !important;
  filter: none !important;
}
.bulkWorkspace .bulkChips > button:hover {
  background: rgba(148, 163, 184, 0.12) !important;
  color: #F8FAFC !important;
}
.bulkWorkspace .bulkChips > button[data-active="true"] {
  background: #C5A059 !important;
  color: #0B111E !important;
}
.bulkWorkspace .bulkChips > button > span {
  min-width: 0 !important;
  padding: 0 !important;
  background: transparent !important;
  color: inherit !important;
  font-size: 10px !important;
  opacity: 0.8;
}
.bulkWorkspace .bulkCardDetail {
  position: relative;
  min-height: 0 !important;
  padding: 11px 40px 11px 12px !important;
}
.bulkWorkspace .bulkCardDetail .bulkRemove {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 24px !important;
  height: 24px !important;
  min-height: 24px !important;
}
.bulkWorkspace .bulkCardList .bulkRemove {
  width: 26px !important;
  height: 26px !important;
  min-height: 26px !important;
}
/* KAD BULK CHIPS END */

/* KAD BULK MOBILE START */
@media (max-width: 640px) {
  .bulkWorkspace div.bulkToolbar[style] {
    display: flex !important;
    flex-wrap: wrap !important;
    justify-content: space-between !important;
    align-items: center !important;
    gap: 6px 0 !important;
    width: 100% !important;
    padding: 4px !important;
    grid-template-columns: none !important;
  }
  .bulkWorkspace div.bulkToolbar[style] > button:not(.bulkTool) {
    flex: 1 1 calc(50% - 4px) !important;
    justify-content: center !important;
    min-height: 38px !important;
  }
  .bulkWorkspace div.bulkToolbar[style] > button:not(.bulkTool):first-child {
    margin-right: 6px !important;
  }
  .bulkWorkspace div.bulkToolbar[style] > .bulkToolSep {
    flex: 0 0 1px !important;
    width: 1px !important;
    height: 20px !important;
    margin: 0 !important;
  }
  .bulkWorkspace div.bulkToolbar[style] > .bulkToolSep:first-of-type {
    flex: 0 0 100% !important;
    width: 100% !important;
    height: 0 !important;
    background: transparent !important;
  }
  .bulkWorkspace div.bulkToolbar[style] > .bulkTool {
    flex: 0 0 auto !important;
    width: 34px !important;
    min-width: 34px !important;
    height: 34px !important;
    min-height: 34px !important;
  }
}
/* KAD BULK MOBILE END */

/* KAD LAYOUT START */
.kadTop {
  background: rgba(11, 17, 30, 0.86) !important;
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border-bottom: 1px solid rgba(197, 160, 89, 0.22);
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.28);
}
.kadHeader {
  background: transparent !important;
  border-bottom: none !important;
  padding: 12px 16px 6px !important;
}
.kadHeader > div:first-child > div:first-child {
  width: 34px !important;
  height: 34px !important;
  border-radius: 10px !important;
  background: linear-gradient(135deg, #E3C783, #C5A059) !important;
  box-shadow: 0 4px 12px rgba(197, 160, 89, 0.30);
  font-size: 16px;
}
.kadHeader h2 {
  letter-spacing: 0.02em;
}
.kadHeader button {
  width: 36px;
  height: 36px;
  padding: 0 !important;
  display: inline-flex !important;
  align-items: center;
  justify-content: center;
  border-radius: 10px !important;
  transition: background-color 0.15s ease, color 0.15s ease;
}
.kadHeader button:hover {
  background: rgba(197, 160, 89, 0.14) !important;
  color: #E3C783 !important;
}
.kadHeader button:last-child:hover {
  background: rgba(239, 68, 68, 0.14) !important;
  color: #F87171 !important;
}
.kadTabs {
  background: transparent !important;
  border-bottom: none !important;
  gap: 6px;
  padding: 6px 12px 10px !important;
  scrollbar-width: none;
}
.kadTabs::-webkit-scrollbar {
  display: none;
}
.kadTabs > button {
  flex: 0 0 auto !important;
  padding: 8px 16px !important;
  border: 0 none !important;
  border-radius: 999px !important;
  background: transparent !important;
  color: #94A3B8 !important;
  font-size: 13px !important;
  font-weight: 600 !important;
  transition: background-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease;
}
.kadTabs > button:hover {
  background: rgba(148, 163, 184, 0.12) !important;
  color: #F8FAFC !important;
}
.kadTabs > button[data-on="true"] {
  background: rgba(197, 160, 89, 0.14) !important;
  color: #C5A059 !important;
  box-shadow: inset 0 0 0 1px rgba(197, 160, 89, 0.45);
}
@media (min-width: 900px) {
  .kadHeader {
    padding: 14px max(24px, calc((100% - 1280px) / 2 + 32px)) 6px !important;
  }
  .kadHeader h2 {
    font-size: 20px !important;
  }
  .kadTabs {
    padding: 6px max(24px, calc((100% - 1280px) / 2 + 32px)) 10px !important;
  }
  .kadContent {
    max-width: 1280px !important;
    padding: 24px 32px 40px !important;
  }
}
/* KAD LAYOUT END */

/* KAD COMPARE START */
.cmpWorkspace .cmpHead { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; }
.cmpWorkspace .cmpActions { display: inline-flex; gap: 4px; padding: 3px; border: 1px solid #24324D; border-radius: 8px; background: rgba(11, 17, 30, 0.55); }
.cmpWorkspace .cmpSearch { display: flex; align-items: center; gap: 8px; margin-top: 14px; padding: 4px 4px 4px 12px; border: 1px solid rgba(148, 163, 184, 0.22); border-radius: 10px; background: rgba(11, 17, 30, 0.72); transition: border-color 0.18s ease, box-shadow 0.18s ease; }
.cmpWorkspace .cmpSearch:focus-within { border-color: #C5A059; box-shadow: 0 0 0 3px rgba(197, 160, 89, 0.12); }
.cmpWorkspace .cmpSearch svg.cmpSearchIcon { color: #94A3B8; flex-shrink: 0; }
.cmpWorkspace .cmpSearch input { flex: 1; min-width: 0; border: none; outline: none; background: transparent; color: #F8FAFC; font-size: 14px; padding: 9px 4px; }
.cmpWorkspace .cmpGo { width: 38px; height: 38px; padding: 0; display: inline-flex; align-items: center; justify-content: center; border: none; border-radius: 8px; background: #C5A059; color: #0B111E; cursor: pointer; flex-shrink: 0; }
.cmpWorkspace .cmpGo:disabled { opacity: 0.5; cursor: not-allowed; }
.cmpWorkspace .cmpChips { display: flex; flex-wrap: wrap; gap: 6px; margin: 16px 0 12px; }
.cmpWorkspace .cmpChip { display: inline-flex; align-items: center; gap: 6px; padding: 4px 11px; border-radius: 999px; border: 1px solid #24324D; background: rgba(18, 24, 36, 0.8); color: #94A3B8; font-size: 11px; font-weight: 700; }
.cmpWorkspace .cmpChip b { color: #F8FAFC; }
.cmpWorkspace .cmpChip.ok { border-color: rgba(16, 185, 129, 0.5); color: #10B981; }
.cmpWorkspace .cmpChip.gold { border-color: rgba(197, 160, 89, 0.5); color: #C5A059; }
.cmpWorkspace .cmpGrid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 10px; animation: bulkReveal 0.18s ease-out; }
.cmpWorkspace .cmpCard { display: flex; flex-direction: column; min-width: 0; padding: 12px; border: 1px solid #24324D; border-radius: 10px; background: rgba(18, 24, 36, 0.78); }
.cmpWorkspace .cmpCard.ok { border-color: rgba(16, 185, 129, 0.4); }
.cmpWorkspace .cmpCard.gold { border-color: rgba(197, 160, 89, 0.35); }
.cmpWorkspace .cmpCardHead { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 10px; }
.cmpWorkspace .cmpCardTitle { display: flex; align-items: center; gap: 7px; min-width: 0; font-size: 12px; font-weight: 700; letter-spacing: 0.03em; overflow-wrap: anywhere; }
.cmpWorkspace .cmpCard.ok .cmpCardTitle { color: #10B981; }
.cmpWorkspace .cmpCard.gold .cmpCardTitle { color: #C5A059; }
.cmpWorkspace .cmpList { display: flex; flex-direction: column; gap: 4px; max-height: 300px; overflow-y: auto; }
.cmpWorkspace .cmpItem { padding: 6px 9px; border-radius: 6px; background: rgba(11, 17, 30, 0.6); border: 1px solid rgba(36, 50, 77, 0.8); color: #F8FAFC; font-size: 11px; overflow-wrap: anywhere; }
.cmpWorkspace .cmpCard.ok .cmpItem { border-color: rgba(16, 185, 129, 0.28); }
.cmpWorkspace .cmpEmpty { padding: 14px; text-align: center; border: 1px dashed #24324D; border-radius: 6px; color: #94A3B8; font-size: 11px; }
@media (min-width: 900px) {
  .kadContent { box-sizing: border-box !important; }
  .cmpWorkspace .cmpGrid { grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); }
}

/* KAD COMPARE TOOLS */
.cmpWorkspace .cmpFilter { display: flex; align-items: center; gap: 8px; margin: 0 0 10px; padding: 3px 4px 3px 11px; border: 1px solid rgba(148, 163, 184, 0.22); border-radius: 8px; background: rgba(11, 17, 30, 0.72); color: #94A3B8; }
.cmpWorkspace .cmpFilter:focus-within { border-color: #C5A059; box-shadow: 0 0 0 3px rgba(197, 160, 89, 0.12); }
.cmpWorkspace .cmpFilter input { flex: 1; min-width: 0; border: none; outline: none; background: transparent; color: #F8FAFC; font-size: 13px; padding: 7px 4px; }
@media (min-width: 900px) { .cmpWorkspace .cmpFilter { max-width: 420px; } }
/* KAD COMPARE END */

/* KAD BULK TAGS START */
.bulkWorkspace .bulkTags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
}
.bulkWorkspace .bulkTag {
  display: inline-flex;
  align-items: center;
  padding: 2px 9px;
  border-radius: 999px;
  border: 1px solid #24324D;
  background: rgba(18, 24, 36, 0.8);
  color: #94A3B8;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.02em;
  white-space: nowrap;
}
.bulkWorkspace .bulkTag.ok {
  border-color: rgba(16, 185, 129, 0.5);
  background: rgba(16, 185, 129, 0.1);
  color: #10B981;
}
.bulkWorkspace .bulkTag.bad {
  border-color: rgba(239, 68, 68, 0.5);
  background: rgba(239, 68, 68, 0.1);
  color: #EF4444;
}
.bulkWorkspace .bulkTag.warn {
  border-color: rgba(245, 158, 11, 0.5);
  background: rgba(245, 158, 11, 0.1);
  color: #F59E0B;
}
.bulkWorkspace .bulkTag.muted {
  font-weight: 600;
}
/* KAD BULK TAGS END */

/* KAD BULK RESULT START */
.bulkWorkspace .bulkResult { margin-top: 18px; padding: 14px; border: 1px solid #24324D; border-radius: 10px; background: rgba(18, 24, 36, 0.6); animation: bulkReveal 0.18s ease-out; }
.bulkWorkspace .bulkResultHead { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; margin-bottom: 12px; }
.bulkWorkspace .bulkResultTitle { font-size: 13px; font-weight: 700; color: #10B981; }
.bulkWorkspace .bulkResultTitle[data-state="warn"] { color: #F59E0B; }
.bulkWorkspace .bulkResultSub { margin-top: 3px; font-size: 11px; letter-spacing: 0.04em; text-transform: uppercase; color: #94A3B8; }
.bulkWorkspace .bulkResultTools { display: inline-flex; gap: 4px; padding: 3px; border: 1px solid #24324D; border-radius: 8px; background: rgba(11, 17, 30, 0.55); }
.bulkWorkspace .bulkResGrid { display: grid; grid-template-columns: 1fr; gap: 6px; max-height: 420px; overflow-y: auto; }
.bulkWorkspace .bulkResRow { display: flex; align-items: center; gap: 10px; min-width: 0; padding: 8px 10px; border: 1px solid rgba(16, 185, 129, 0.35); border-radius: 8px; background: rgba(11, 17, 30, 0.5); }
.bulkWorkspace .bulkResRow.bad { border-color: rgba(239, 68, 68, 0.45); background: rgba(239, 68, 68, 0.06); }
.bulkWorkspace .bulkResIcon { display: inline-flex; flex-shrink: 0; color: #94A3B8; }
.bulkWorkspace .bulkResBody { flex: 1; min-width: 0; }
.bulkWorkspace .bulkResId { font-size: 12px; font-weight: 700; color: #F8FAFC; overflow-wrap: anywhere; }
.bulkWorkspace .bulkResMsg { margin-top: 2px; font-size: 11px; color: #94A3B8; overflow-wrap: anywhere; }
.bulkWorkspace .bulkResRow.bad .bulkResMsg { color: #F87171; }
.bulkWorkspace .bulkResEmpty { padding: 16px; text-align: center; border: 1px dashed #24324D; border-radius: 8px; color: #94A3B8; font-size: 12px; }
@media (min-width: 900px) { .bulkWorkspace .bulkResGrid { grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); } }
/* KAD BULK RESULT END */

/* KAD DESKTOP PANEL START */
@media (min-width: 900px) {
  .kadSummary {
    grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
    gap: 12px !important;
    align-items: start;
  }
  .kadSummary > *:nth-child(3) {
    grid-column: span 2 !important;
  }
  .kadSummary > *:nth-child(n+4) {
    grid-column: span 2 !important;
  }
  .kadSummary > *:nth-child(n+4):last-child:nth-child(even) {
    grid-column: 1 / -1 !important;
  }
  .kadSummary > *:nth-child(1),
  .kadSummary > *:nth-child(2) {
    padding: 12px 14px !important;
  }
  .kadSummary > *:nth-child(1) h3,
  .kadSummary > *:nth-child(2) h3 {
    font-size: 22px !important;
    margin: 6px 0 2px 0 !important;
  }
}

/* KAD LDAP CARD */
@media (min-width: 900px) {
  .kadSummary > *:nth-child(1),
  .kadSummary > *:nth-child(2),
  .kadSummary > *:nth-child(3) {
    align-self: stretch !important;
  }
  .kadSummary > *:nth-child(3) {
    display: flex !important;
    flex-direction: column;
    justify-content: center;
  }
}
/* KAD DESKTOP PANEL END */

/* KAD BULK COPY */
.bulkWorkspace .bulkCopy {
  cursor: pointer;
  border-bottom: 1px dotted transparent;
  transition: color 0.15s ease, border-color 0.15s ease;
}
.bulkWorkspace .bulkCopy:hover {
  color: #C5A059;
  border-bottom-color: rgba(197, 160, 89, 0.7);
}

/* KAD VETORH START */
.vetorhWorkspace > div {
  position: relative;
  overflow: hidden;
  padding: 18px !important;
  border-color: rgba(197, 160, 89, 0.24) !important;
  background:
    radial-gradient(circle at top right, rgba(197, 160, 89, 0.09), transparent 32%),
    #161F32 !important;
}
.vetorhWorkspace > div::before {
  content: "";
  position: absolute;
  top: 0;
  left: 18px;
  right: 18px;
  height: 2px;
  border-radius: 999px;
  background: linear-gradient(90deg, transparent, #C5A059, transparent);
  pointer-events: none;
}
.vetorhWorkspace input,
.vetorhWorkspace textarea,
.vetorhWorkspace select {
  border-radius: 8px !important;
  border-color: rgba(148, 163, 184, 0.22) !important;
  background-color: rgba(11, 17, 30, 0.76) !important;
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}
.vetorhWorkspace input:hover,
.vetorhWorkspace textarea:hover,
.vetorhWorkspace select:hover {
  border-color: rgba(197, 160, 89, 0.48) !important;
}
.vetorhWorkspace input:focus,
.vetorhWorkspace textarea:focus,
.vetorhWorkspace select:focus {
  border-color: #C5A059 !important;
  box-shadow: 0 0 0 3px rgba(197, 160, 89, 0.12);
  outline: none;
}
.vetorhWorkspace button {
  min-height: 38px;
  border-radius: 8px !important;
  transition: transform 0.14s ease, filter 0.14s ease, opacity 0.14s ease;
}
.vetorhWorkspace button:hover {
  filter: brightness(1.08);
}
.vetorhWorkspace button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.vetorhWorkspace .vtCopy {
  cursor: pointer;
  border-bottom: 1px dotted transparent;
  transition: color 0.15s ease, border-color 0.15s ease;
}
.vetorhWorkspace .vtCopy:hover {
  color: #C5A059;
  border-bottom-color: rgba(197, 160, 89, 0.7);
}
@media (min-width: 900px) {
  .vetorhWorkspace {
    display: grid !important;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: start;
    gap: 16px !important;
  }
}
/* KAD VETORH END */

/* KAD IDENTITY LIST START */
.idResult {
  position: relative;
  transition: border-color 0.16s ease, transform 0.16s ease, background-color 0.16s ease;
}
.idResult:hover {
  border-color: rgba(197, 160, 89, 0.55) !important;
  background-color: rgba(22, 31, 50, 0.98) !important;
  transform: translateY(-1px);
}
.idResult .idCopy {
  cursor: copy;
  border-bottom: 1px dotted transparent;
  transition: color 0.15s ease, border-color 0.15s ease;
}
.idResult .idCopy:hover {
  color: #C5A059;
  border-bottom-color: rgba(197, 160, 89, 0.7);
}
@media (min-width: 900px) {
  div:has(> .idResult) {
    display: grid !important;
    grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
    gap: 10px !important;
  }
}
/* KAD IDENTITY LIST END */

/* KAD IDENTITY DETAIL START */
.idDetail {
  position: relative;
  overflow: hidden;
  padding: 18px !important;
  border-color: rgba(197, 160, 89, 0.24) !important;
  background:
    radial-gradient(circle at top right, rgba(197, 160, 89, 0.09), transparent 32%),
    #161F32 !important;
}
.idDetail::before {
  content: "";
  position: absolute;
  top: 0;
  left: 18px;
  right: 18px;
  height: 2px;
  border-radius: 999px;
  background: linear-gradient(90deg, transparent, #C5A059, transparent);
  pointer-events: none;
}
.idDetail .idHead > div:first-child {
  width: 52px !important;
  height: 52px !important;
  border-radius: 12px !important;
  flex-shrink: 0;
}
.idDetail .idStatus > * {
  border-radius: 999px !important;
  padding: 4px 12px !important;
  font-size: 11px !important;
  font-weight: 700 !important;
}
.idDetail .idTabs {
  display: flex;
  gap: 4px !important;
  width: fit-content;
  max-width: 100%;
  padding: 4px !important;
  overflow-x: auto;
  scrollbar-width: none;
  border: 1px solid #24324D !important;
  border-radius: 10px;
  background: rgba(11, 17, 30, 0.55);
}
.idDetail .idTabs::-webkit-scrollbar {
  display: none;
}
.idDetail .idTabs > button {
  flex: 0 0 auto;
  padding: 7px 14px !important;
  border: 0 none !important;
  border-radius: 7px !important;
  background: transparent !important;
  color: #94A3B8 !important;
  font-size: 12px !important;
  font-weight: 600 !important;
  transition: background-color 0.15s ease, color 0.15s ease;
}
.idDetail .idTabs > button:hover {
  background: rgba(148, 163, 184, 0.12) !important;
  color: #F8FAFC !important;
}
.idDetail .idTabs > button[data-on="true"] {
  background: #C5A059 !important;
  color: #0B111E !important;
}
.idDetail .idCopy {
  cursor: copy;
  border-bottom: 1px dotted transparent;
  transition: color 0.15s ease, border-color 0.15s ease;
}
.idDetail .idCopy:hover {
  color: #C5A059;
  border-bottom-color: rgba(197, 160, 89, 0.7);
}
@media (min-width: 900px) {
  .idDetail div[style*="grid-template-columns: 1fr 1fr"] {
    grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
  }
}
/* KAD IDENTITY DETAIL END */
/* KAD BULK VISUAL END */
`;

document.head.appendChild(styleSheet);

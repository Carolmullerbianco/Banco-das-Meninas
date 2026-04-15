import './index.css';

import { 
    db, auth, googleProvider, 
    signInWithPopup, onAuthStateChanged, 
    doc, onSnapshot, setDoc, 
    handleFirestoreError, OperationType 
} from './firebase';

import fridaImg from './assets/frida.png';
import piggyImg from './assets/piggy.png';

/**
 * Banco das Meninas - Lógica da Aplicação com Firebase
 * Versão: 5.2 (Imagens Fixas e Botão Sair Restaurado)
 */

// Configuração dos cofrinhos e seus percentuais
const PIGGY_BANKS_CONFIG = [
    { 
        id: 'frida', 
        name: 'Frida', 
        category: 'Investimentos', 
        percent: 36.67, 
        color: 'bg-premium-blue', 
        image: fridaImg,
        icon: '🐔'
    },
    { 
        id: 'bino', 
        name: 'Bino', 
        category: 'Gastos', 
        percent: 20.00, 
        color: 'bg-rose-400', 
        image: piggyImg,
        icon: '🐷'
    },
    { 
        id: 'deco', 
        name: 'Deco', 
        category: 'Sonhos', 
        percent: 20.00, 
        color: 'bg-premium-green', 
        image: piggyImg,
        icon: '🐷'
    },
    { 
        id: 'edu', 
        name: 'Edu', 
        category: 'Educação', 
        percent: 13.33, 
        color: 'bg-amber-400', 
        image: piggyImg,
        icon: '🐷'
    },
    { 
        id: 'cora', 
        name: 'Cora', 
        category: 'Doação', 
        percent: 10.00, 
        color: 'bg-purple-400', 
        image: piggyImg,
        icon: '🐷'
    }
];

// Temas das abas
const THEMES = {
    malu: {
        body: 'bg-[#080a11]',
        blobs: 'opacity-20',
        blobColors: ['bg-blue-600', 'bg-indigo-600'],
        title: 'text-white font-bold tracking-tight',
        footer: 'text-white/40',
        tabActive: 'bg-premium-blue text-white shadow-lg shadow-premium-blue/20',
        tabInactive: 'text-white/40 hover:text-white/60',
        tabsContainer: 'bg-white/[0.05] border-white/[0.1]',
        textColor: 'text-white',
        subColor: 'text-white/60',
        cardBg: 'bg-white/[0.05]',
        cardHover: 'hover:bg-white/[0.08]',
        sectionBg: 'bg-premium-card/30 border-white/5'
    },
    babi: {
        body: 'bg-white',
        blobs: 'opacity-20',
        blobColors: ['bg-purple-300', 'bg-pink-300'],
        title: 'text-[#1a162e] font-bold tracking-tight',
        footer: 'text-[#1a162e]/40',
        tabActive: 'bg-[#a855f7] text-white shadow-lg shadow-purple-500/40',
        tabInactive: 'text-[#1a162e]/40 hover:text-[#1a162e]/60',
        tabsContainer: 'bg-[#1a162e]/[0.05] border-[#1a162e]/[0.1]',
        textColor: 'text-[#1a162e]',
        subColor: 'text-[#1a162e]/60',
        cardBg: 'bg-[#a855f7]/10',
        cardHover: 'hover:bg-[#a855f7]/20',
        sectionBg: 'bg-[#a855f7]/10 border-[#a855f7]/20'
    }
};

// Cores específicas para a Babi para manter a harmonia lilás/roxo
const BABI_BANK_COLORS = {
    frida: 'bg-purple-600',
    bino: 'bg-pink-500',
    deco: 'bg-purple-400',
    edu: 'bg-indigo-400',
    cora: 'bg-fuchsia-400'
};

// Estado da aplicação
let state = {
    activeUser: 'malu' as 'malu' | 'babi',
    activeView: 'home', // 'home', 'goals' ou 'history'
    currentUser: null as any,
    users: {
        malu: {
            balances: { frida: 0, bino: 0, deco: 0, edu: 0, cora: 0 },
            goals: { frida: 0, bino: 0, deco: 0, edu: 0, cora: 0 },
            totalIncome: 0,
            totalExpenses: 0,
            history: [] as any[]
        },
        babi: {
            balances: { frida: 0, bino: 0, deco: 0, edu: 0, cora: 0 },
            goals: { frida: 0, bino: 0, deco: 0, edu: 0, cora: 0 },
            totalIncome: 0,
            totalExpenses: 0,
            history: [] as any[]
        }
    }
};

// Listeners do Firestore
let unsubscribers = [];

/**
 * Inicializa a aplicação
 */
async function init() {
    // Tentar carregar do localStorage primeiro para rapidez e offline
    const localMalu = localStorage.getItem('banco_meninas_malu');
    const localBabi = localStorage.getItem('banco_meninas_babi');
    if (localMalu) state.users.malu = JSON.parse(localMalu);
    if (localBabi) state.users.babi = JSON.parse(localBabi);

    setupAuth();
    setupEventListeners();
    applyTheme();
    renderAll();
}

/**
 * Configura a autenticação
 */
function setupAuth() {
    onAuthStateChanged(auth, (user) => {
        state.currentUser = user;
        updateAuthUI();
        
        if (user) {
            startSync();
        } else {
            stopSync();
            resetState();
            renderAll();
        }
    });
}

/**
 * Atualiza a UI de autenticação
 */
function updateAuthUI() {
    const loginBtn = document.getElementById('login-btn');
    const userInfo = document.getElementById('user-info');
    const userPhoto = document.getElementById('user-photo');
    const userName = document.getElementById('user-name');
    const syncStatus = document.getElementById('sync-status');

    if (state.currentUser) {
        loginBtn.classList.add('hidden');
        userInfo.classList.remove('hidden');
        if (syncStatus) syncStatus.classList.remove('hidden');
        (userPhoto as HTMLImageElement).src = state.currentUser.photoURL || '';
        userName.textContent = state.currentUser.displayName || 'Usuário';
    } else {
        loginBtn.classList.remove('hidden');
        userInfo.classList.add('hidden');
        if (syncStatus) syncStatus.classList.add('hidden');
    }
}

/**
 * Inicia a sincronização em tempo real com o Firestore
 */
function startSync() {
    stopSync(); // Limpar anteriores se houver

    const users = ['malu', 'babi'];
    users.forEach(userId => {
        const unsub = onSnapshot(doc(db, 'user_data', userId), (snapshot) => {
            if (snapshot.exists()) {
                const remoteData = snapshot.data();
                // Só atualiza se houver dados válidos e não for um estado vazio acidental
                if (remoteData && remoteData.balances) {
                    state.users[userId] = remoteData;
                    renderAll();
                    updateLastSyncTime();
                }
            } else {
                // Criar documento inicial se não existir e tivermos dados locais
                if (state.users[userId] && state.users[userId].balances) {
                    saveUserData(userId, state.users[userId], true);
                }
            }
        }, (error) => {
            handleFirestoreError(error, OperationType.GET, `user_data/${userId}`);
        });
        unsubscribers.push(unsub);
    });
}

/**
 * Atualiza o horário da última sincronização na UI
 */
function updateLastSyncTime() {
    const syncStatus = document.getElementById('sync-status');
    if (syncStatus && state.currentUser) {
        const now = new Date();
        const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        syncStatus.innerHTML = `
            <div class="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
            <span class="text-[8px] font-bold uppercase tracking-widest text-green-500/80">Sincronizado: ${timeStr}</span>
        `;
    }
}

/**
 * Salva os dados do usuário no Firestore com proteção contra dados vazios
 */
async function saveUserData(userId, data, isInitial = false) {
    if (!state.currentUser) return;
    
    // Proteção: Não salvar se os dados parecerem corrompidos ou vazios (exceto se for um reset explícito)
    if (!isInitial && (!data || !data.balances || Object.keys(data.balances).length === 0)) {
        console.warn('Tentativa de salvar dados inválidos bloqueada para evitar perda de dados.');
        return;
    }

    const syncStatus = document.getElementById('sync-status');
    if (syncStatus) {
        syncStatus.innerHTML = `
            <div class="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></div>
            <span class="text-[8px] font-bold uppercase tracking-widest text-amber-500/80">Salvando...</span>
        `;
        syncStatus.className = "flex items-center gap-3 px-2 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 transition-all";
    }

    try {
        // Salvar no localStorage como backup imediato
        localStorage.setItem(`banco_meninas_${userId}`, JSON.stringify(data));
        
        await setDoc(doc(db, 'user_data', userId), data);
        updateLastSyncTime();
        if (syncStatus) {
            syncStatus.className = "flex items-center gap-3 px-2 py-1.5 rounded-lg bg-green-500/10 border border-green-500/20 transition-all";
        }
    } catch (error) {
        if (syncStatus) {
            syncStatus.innerHTML = `
                <div class="w-1.5 h-1.5 rounded-full bg-red-500"></div>
                <span class="text-[8px] font-bold uppercase tracking-widest text-red-500/80">Erro ao Salvar</span>
            `;
            syncStatus.className = "flex items-center gap-3 px-2 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 transition-all";
        }
        handleFirestoreError(error, OperationType.WRITE, `user_data/${userId}`);
    }
}

/**
 * Para a sincronização
 */
function stopSync() {
    unsubscribers.forEach(unsub => unsub());
    unsubscribers = [];
}

/**
 * Reseta o estado local
 */
function resetState() {
    state.users = {
        malu: { 
            balances: { frida: 0, bino: 0, deco: 0, edu: 0, cora: 0 }, 
            goals: { frida: 0, bino: 0, deco: 0, edu: 0, cora: 0 },
            totalIncome: 0, 
            totalExpenses: 0,
            history: []
        },
        babi: { 
            balances: { frida: 0, bino: 0, deco: 0, edu: 0, cora: 0 }, 
            goals: { frida: 0, bino: 0, deco: 0, edu: 0, cora: 0 },
            totalIncome: 0, 
            totalExpenses: 0,
            history: []
        }
    };
}

/**
 * Renderiza tudo
 */
function renderAll() {
    renderPiggyBanks();
    renderSummary();
    renderGoals();
    renderHistory();
}

/**
 * Aplica o tema visual
 */
function applyTheme() {
    const theme = THEMES[state.activeUser];
    const body = document.getElementById('app-body');
    const title = document.getElementById('main-title');
    const footer = document.getElementById('app-footer');
    const bgBlobs = document.getElementById('bg-blobs');
    const tabMalu = document.getElementById('tab-malu');
    const tabBabi = document.getElementById('tab-babi');
    const sidebar = document.getElementById('sidebar');

    body.className = `${theme.body} min-h-screen font-sans ${theme.textColor} transition-all duration-1000 overflow-x-hidden flex antialiased`;
    title.className = `text-lg font-black tracking-tighter italic uppercase transition-colors duration-500 ${theme.title} opacity-40`;
    footer.className = `mt-20 text-center text-[10px] uppercase tracking-[0.4em] font-bold transition-colors duration-500 ${theme.footer}`;

    bgBlobs.className = `fixed inset-0 -z-10 overflow-hidden pointer-events-none ${theme.blobs} transition-opacity duration-1000`;
    const blobs = bgBlobs.querySelectorAll('div');
    if (blobs.length >= 2) {
        blobs[0].className = `absolute top-0 -left-4 w-96 h-96 ${theme.blobColors[0]} rounded-full mix-blend-multiply filter blur-[100px] animate-blob transition-colors duration-1000`;
        blobs[1].className = `absolute bottom-0 -right-4 w-96 h-96 ${theme.blobColors[1]} rounded-full mix-blend-multiply filter blur-[100px] animate-blob animation-delay-2000 transition-colors duration-1000`;
    }
    
    if (sidebar) {
        sidebar.className = `w-20 lg:w-64 border-r ${state.activeUser === 'babi' ? 'border-[#1a162e]/10' : 'border-white/10'} flex-col hidden md:flex sticky top-0 h-screen ${theme.body} z-50 transition-all duration-500`;
    }

    const tabsContainer = document.getElementById('tabs-container');
    tabsContainer.className = `flex p-1.5 rounded-xl backdrop-blur-md border transition-all duration-500 ${theme.tabsContainer}`;

    const tabBase = "px-6 py-2 rounded-lg font-bold text-xs uppercase tracking-widest transition-all active:scale-95";
    if (state.activeUser === 'malu') {
        tabMalu.className = `${tabBase} ${theme.tabActive}`;
        tabBabi.className = `${tabBase} ${theme.tabInactive}`;
    } else {
        tabBabi.className = `${tabBase} ${theme.tabActive}`;
        tabMalu.className = `${tabBase} ${theme.tabInactive}`;
    }

    // Explicitly style inputs and selects for visibility
    const inputs = ['amount-input', 'output-amount-input'];
    inputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.className = `w-full bg-transparent border-none outline-none pl-6 pr-4 py-1.5 text-base font-semibold placeholder-current opacity-60 ${theme.textColor} tracking-tight`;
    });

    const select = document.getElementById('output-bank-select');
    if (select) select.className = `bg-transparent border-none outline-none text-[9px] font-bold uppercase tracking-widest opacity-40 hover:opacity-80 cursor-pointer ${theme.textColor} transition-opacity`;

    // Style input and output sections
    const inputOutputSections = ['input-section', 'output-section'];
    inputOutputSections.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.className = `rounded-xl p-2 flex items-center gap-3 border shadow-xl transition-all duration-500 ${state.activeUser === 'babi' ? 'bg-[#1a162e]/[0.05] border-[#1a162e]/10' : 'bg-white/[0.1] border-white/[0.2]'}`;
            
            // Fix labels and R$ inside sections
            const spans = el.querySelectorAll('span');
            spans.forEach(span => {
                if (span.textContent === 'R$') {
                    span.className = `absolute left-0 top-1/2 -translate-y-1/2 text-xs font-bold transition-colors duration-500 ${state.activeUser === 'babi' ? 'text-[#1a162e]/30' : 'text-white/40'}`;
                } else {
                    span.className = `text-xs font-bold uppercase tracking-widest transition-colors duration-500 ${state.activeUser === 'babi' ? 'text-[#1a162e]/60' : 'text-white/80'}`;
                }
            });
        }
    });

    // Style the "Gastar" button specifically - Dark Gray for Babi
    const outputBtn = document.getElementById('output-btn');
    if (outputBtn) {
        if (state.activeUser === 'babi') {
            outputBtn.className = `text-[10px] font-bold uppercase tracking-widest px-6 py-3 rounded-lg transition-all border bg-gray-800 text-white border-gray-700 shadow-lg shadow-gray-900/20`;
        } else {
            outputBtn.className = `text-[10px] font-bold uppercase tracking-widest px-6 py-3 rounded-lg transition-all border bg-white/[0.2] hover:bg-white/[0.3] text-white border-white/10`;
        }
    }

    // Style the "Receber" button specifically
    const addBtn = document.getElementById('add-btn');
    if (addBtn) {
        addBtn.className = `text-[10px] font-bold uppercase tracking-widest px-6 py-3 rounded-lg transition-all shadow-lg ${state.activeUser === 'babi' ? 'bg-[#a855f7] text-white shadow-purple-500/20' : 'bg-premium-blue hover:bg-premium-blue/80 text-white shadow-premium-blue/20'}`;
    }

    // Update sidebar items text color
    const navItems = ['nav-home', 'nav-goals'];
    navItems.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            const span = el.querySelector('span');
            if (span) {
                span.className = `font-bold text-xs uppercase tracking-widest transition-colors duration-500 ${state.activeUser === 'babi' ? 'text-[#1a162e]' : 'text-white'}`;
            }
        }
    });

    // Update mobile nav items initial state
    switchView(state.activeView);

    // Update Goals View Sections
    const goalsView = document.getElementById('goals-view');
    if (goalsView) {
        const sections = goalsView.querySelectorAll('.bg-premium-card\\/30');
        sections.forEach(section => {
            (section as HTMLElement).className = `bg-premium-card/30 rounded-2xl sm:rounded-[2.5rem] p-6 sm:p-10 border transition-all duration-500 ${theme.sectionBg}`;
        });
    }

    const saveGoalsBtn = document.getElementById('save-goals-btn');
    const saveBalancesBtn = document.getElementById('save-balances-btn');
    const btnBase = "text-white text-[10px] font-black uppercase tracking-[0.2em] px-12 py-4 rounded-full transition-all shadow-lg";
    
    if (saveGoalsBtn) {
        saveGoalsBtn.className = `${btnBase} ${state.activeUser === 'babi' ? 'bg-[#a855f7] shadow-purple-500/20' : 'bg-premium-green shadow-premium-green/20'}`;
    }
    if (saveBalancesBtn) {
        saveBalancesBtn.className = `${btnBase} ${state.activeUser === 'babi' ? 'bg-[#a855f7] shadow-purple-500/20' : 'bg-premium-blue shadow-premium-blue/20'}`;
    }
}

/**
 * Renderiza os cards dos cofrinhos
 */
function renderPiggyBanks() {
    const grid = document.getElementById('piggy-banks-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const userData = state.users[state.activeUser];
    const theme = THEMES[state.activeUser];

    if (!state.currentUser) {
        grid.innerHTML = `
            <div class="col-span-full flex flex-col items-center justify-center py-20 space-y-6 text-center">
                <div class="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center text-4xl border border-white/10">
                    🔒
                </div>
                <div class="space-y-2">
                    <h3 class="text-xl font-bold ${theme.textColor}">Acesso Restrito</h3>
                    <p class="text-xs ${theme.subColor} max-w-[240px] mx-auto leading-relaxed">
                        Faça login para ver e gerenciar seus cofrinhos com segurança na nuvem.
                    </p>
                </div>
                <button type="button" onclick="document.getElementById('login-btn').click()" class="px-8 py-3 rounded-xl bg-premium-blue text-white text-xs font-bold uppercase tracking-widest shadow-lg shadow-premium-blue/20 active:scale-95 transition-all">
                    Entrar com Google
                </button>
            </div>
        `;
        return;
    }

    if (!userData || !userData.balances) {
        grid.innerHTML = `
            <div class="col-span-full flex flex-col items-center justify-center py-20 space-y-4 opacity-40">
                <div class="w-12 h-12 border-4 border-white/10 border-t-white/40 rounded-full animate-spin"></div>
                <p class="text-xs font-bold uppercase tracking-[0.3em] animate-pulse">Sincronizando Cofrinhos...</p>
            </div>
        `;
        return;
    }

    const activeBalances = userData.balances;
    const activeGoals = userData.goals || { frida: 0, bino: 0, deco: 0, edu: 0, cora: 0 };

    PIGGY_BANKS_CONFIG.forEach(bank => {
        const balance = activeBalances[bank.id] || 0;
        const goal = activeGoals[bank.id] || 0;
        
        const bankColor = state.activeUser === 'babi' ? BABI_BANK_COLORS[bank.id] : bank.color;

        const card = document.createElement('div');
        card.className = `${theme.cardBg} rounded-2xl p-5 border border-white/[0.05] transition-all duration-300 ${theme.cardHover} group relative overflow-hidden`;
        
        const isGoalReached = goal > 0 && balance >= goal;

        let progress = 0;
        let remaining = goal - balance;
        if (goal > 0) {
            progress = Math.min((balance / goal) * 100, 100);
        }

        const themeIconColor = state.activeUser === 'babi' ? 'text-purple-600' : 'text-white';
        const iconHtml = bank.image 
            ? `<img src="${bank.image}" alt="${bank.name}" class="w-full h-full object-cover" referrerPolicy="no-referrer">`
            : `<div class="w-full h-full flex items-center justify-center text-xl ${themeIconColor}">${bank.icon || '🐷'}</div>`;

        card.innerHTML = `
            <div class="relative z-10 h-full flex flex-col justify-between">
                <div class="flex justify-between items-start">
                    <div class="w-12 h-12 rounded-xl ${bankColor}/30 flex items-center justify-center overflow-hidden group-hover:scale-110 transition-transform duration-500 border ${state.activeUser === 'babi' ? 'border-[#1a162e]/10' : 'border-white/10'}">
                        ${iconHtml}
                    </div>
                    <div class="text-right">
                        <span class="text-[10px] font-bold uppercase tracking-[0.2em] ${state.activeUser === 'babi' ? 'text-[#1a162e]/40' : 'text-white/70'}">${bank.category}</span>
                        <p class="text-sm font-bold uppercase tracking-widest ${state.activeUser === 'babi' ? 'text-[#1a162e]' : 'text-white'} mt-1">${bank.name}</p>
                    </div>
                </div>
                
                <div class="mt-6 space-y-4">
                    <div class="text-3xl font-bold tracking-tight ${theme.textColor}">
                        <span class="text-sm opacity-60 mr-1">R$</span>${formatCurrency(balance)}
                    </div>

                    ${goal > 0 ? `
                        <div class="space-y-2 pt-4 border-t ${state.activeUser === 'babi' ? 'border-[#1a162e]/10' : 'border-white/10'}">
                            <div class="flex justify-between items-end">
                                <span class="text-[10px] font-bold uppercase tracking-widest ${state.activeUser === 'babi' ? 'text-[#1a162e]/40' : 'text-white/60'}">Meta: R$ ${formatCurrency(goal)}</span>
                                <span class="text-xs font-bold ${theme.textColor}">${Math.round(progress)}%</span>
                            </div>
                            <div class="h-2 w-full ${state.activeUser === 'babi' ? 'bg-[#1a162e]/10' : 'bg-white/10'} rounded-full overflow-hidden border ${state.activeUser === 'babi' ? 'border-[#1a162e]/5' : 'border-white/5'}">
                                <div class="h-full ${bankColor} transition-all duration-1000 ease-out shadow-[0_0_15px_rgba(255,255,255,0.3)]" style="width: ${progress}%"></div>
                            </div>
                            <div class="flex justify-between items-center">
                                <span class="text-[10px] font-bold uppercase tracking-widest ${isGoalReached ? 'text-premium-green brightness-125' : (state.activeUser === 'babi' ? 'text-[#1a162e]/30' : 'text-white/50')}">
                                    ${isGoalReached ? 'Meta atingida 🎉' : `Falta: R$ ${formatCurrency(Math.max(0, remaining))}`}
                                </span>
                            </div>
                        </div>
                    ` : `
                        <div class="pt-4 border-t ${state.activeUser === 'babi' ? 'border-[#1a162e]/10' : 'border-white/10'}">
                            <p class="text-[10px] font-bold ${state.activeUser === 'babi' ? 'text-[#1a162e]/20' : 'text-white/40'} uppercase tracking-widest">Sem meta definida</p>
                        </div>
                    `}
                </div>
            </div>
            
            <!-- Bottom Accent Line -->
            <div class="absolute bottom-0 left-0 w-full h-1.5 ${bankColor} opacity-40 group-hover:opacity-100 transition-all duration-500"></div>
        `;
        grid.appendChild(card);
    });
}

/**
 * Renderiza a lista de metas para edição
 */
function renderGoals() {
    const goalsList = document.getElementById('goals-list');
    const balancesList = document.getElementById('balances-list');
    if (!goalsList || !balancesList) return;
    
    goalsList.innerHTML = '';
    balancesList.innerHTML = '';

    const userData = state.users[state.activeUser];
    const theme = THEMES[state.activeUser];

    if (!state.currentUser) {
        const loginMsg = `
            <div class="col-span-full flex flex-col items-center justify-center py-10 space-y-4 text-center opacity-60">
                <div class="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center text-3xl border border-white/10">
                    🔒
                </div>
                <p class="text-xs font-bold uppercase tracking-widest ${theme.textColor}">Login necessário para ver metas</p>
            </div>
        `;
        goalsList.innerHTML = loginMsg;
        balancesList.innerHTML = loginMsg;
        return;
    }

    const goals = userData.goals || { frida: 0, bino: 0, deco: 0, edu: 0, cora: 0 };
    const balances = userData.balances || { frida: 0, bino: 0, deco: 0, edu: 0, cora: 0 };

    PIGGY_BANKS_CONFIG.forEach(bank => {
        const bankColor = state.activeUser === 'babi' ? BABI_BANK_COLORS[bank.id] : bank.color;
        
        const themeIconColor = state.activeUser === 'babi' ? 'text-purple-600' : 'text-white';
        const imageHtml = bank.image 
            ? `<img src="${bank.image}" alt="${bank.name}" class="w-full h-full object-cover" referrerPolicy="no-referrer">`
            : `<div class="w-full h-full flex items-center justify-center text-xl ${themeIconColor}">${bank.icon || '🐷'}</div>`;

        // Render Goals
        const goalValue = goals[bank.id] || 0;
        const goalItem = document.createElement('div');
        goalItem.className = `flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6 p-4 sm:p-6 ${theme.cardBg} rounded-2xl border ${state.activeUser === 'babi' ? 'border-[#1a162e]/10' : 'border-white/[0.03]'} transition-all`;
        
        goalItem.innerHTML = `
            <div class="flex items-center gap-4 flex-1">
                <div class="w-12 h-12 rounded-xl ${bankColor}/20 flex items-center justify-center text-2xl border ${state.activeUser === 'babi' ? 'border-[#1a162e]/10' : 'border-white/10'} overflow-hidden shrink-0">
                    ${imageHtml}
                </div>
                <div class="flex-1">
                    <h4 class="text-lg font-bold tracking-tight ${theme.textColor}">${bank.name}</h4>
                    <p class="text-[10px] font-bold uppercase tracking-widest ${state.activeUser === 'babi' ? 'text-[#1a162e]/40' : 'opacity-20'}">${bank.category}</p>
                </div>
            </div>
            <div class="relative w-full sm:w-40">
                <span class="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-bold ${state.activeUser === 'babi' ? 'text-[#1a162e]/30' : 'opacity-20'}">R$</span>
                <input type="number" data-bank-id="${bank.id}" value="${goalValue > 0 ? goalValue : ''}" placeholder="Meta" 
                    class="goal-input w-full ${state.activeUser === 'babi' ? 'bg-[#1a162e]/[0.05] border-[#1a162e]/10 text-[#1a162e]' : 'bg-white/[0.03] border-white/[0.05] text-white'} border rounded-xl pl-10 pr-4 py-3 text-base font-bold focus:border-premium-blue/30 outline-none transition-all placeholder-current opacity-60">
            </div>
        `;
        goalsList.appendChild(goalItem);

        // Render Balances Adjustment
        const balanceValue = balances[bank.id] || 0;
        const balanceItem = document.createElement('div');
        balanceItem.className = `flex items-center gap-6 p-4 ${theme.cardBg} rounded-2xl border ${state.activeUser === 'babi' ? 'border-[#1a162e]/10' : 'border-white/[0.03]'} transition-all`;
        balanceItem.innerHTML = `
            <div class="w-12 h-12 rounded-xl ${bankColor}/20 flex items-center justify-center text-2xl border ${state.activeUser === 'babi' ? 'border-[#1a162e]/10' : 'border-white/10'} overflow-hidden">
                ${imageHtml}
            </div>
            <div class="flex-1">
                <h4 class="text-lg font-bold tracking-tight ${theme.textColor}">${bank.name}</h4>
                <p class="text-[10px] font-bold uppercase tracking-widest ${state.activeUser === 'babi' ? 'text-[#1a162e]/40' : 'opacity-20'}">Saldo Atual</p>
            </div>
            <div class="relative w-40">
                <span class="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-bold ${state.activeUser === 'babi' ? 'text-[#1a162e]/30' : 'opacity-20'}">R$</span>
                <input type="number" data-bank-id="${bank.id}" value="${balanceValue}" step="0.01"
                    class="balance-input w-full ${state.activeUser === 'babi' ? 'bg-[#1a162e]/[0.05] border-[#1a162e]/10 text-[#1a162e]' : 'bg-white/[0.03] border-white/[0.05] text-white'} border rounded-xl pl-10 pr-4 py-3 text-base font-bold focus:border-premium-blue/30 outline-none transition-all placeholder-current opacity-60">
            </div>
        `;
        balancesList.appendChild(balanceItem);
    });
}

/**
 * Renderiza o resumo geral
 */
function renderSummary() {
    const user = state.users[state.activeUser];
    const theme = THEMES[state.activeUser];
    
    const incomeEl = document.getElementById('total-income');
    const expensesEl = document.getElementById('total-expenses');
    const balanceEl = document.getElementById('total-balance');
    const summarySection = document.getElementById('summary-section');
    
    if (!state.currentUser) {
        if (incomeEl) incomeEl.textContent = `R$ 0,00`;
        if (expensesEl) expensesEl.textContent = `R$ 0,00`;
        if (balanceEl) balanceEl.textContent = `R$ 0,00`;
        return;
    }
    
    const totalBalance = Object.values(user.balances).reduce((a: number, b: number) => a + b, 0);
    
    if (incomeEl) incomeEl.textContent = `R$ ${formatCurrency(user.totalIncome || 0)}`;
    if (expensesEl) expensesEl.textContent = `R$ ${formatCurrency(user.totalExpenses || 0)}`;
    if (balanceEl) {
        balanceEl.textContent = `R$ ${formatCurrency(totalBalance)}`;
        balanceEl.className = `text-4xl font-bold tracking-tight transition-colors duration-500 ${theme.textColor}`;
    }

    if (summarySection) {
        summarySection.className = `rounded-2xl p-8 border transition-all duration-500 flex flex-col md:flex-row justify-between items-center gap-6 ${theme.cardBg} ${state.activeUser === 'babi' ? 'border-[#1a162e]/10' : 'border-white/[0.1]'}`;
        
        // Fix labels in summary
        const labels = summarySection.querySelectorAll('span:not([id])');
        labels.forEach(label => {
            label.className = `text-xs font-bold uppercase tracking-widest mb-1 transition-colors duration-500 ${state.activeUser === 'babi' ? 'text-[#1a162e]/40' : 'text-white/40'}`;
        });
    }
}

/**
 * Configura os ouvintes de eventos
 */
function setupEventListeners() {
    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const addBtn = document.getElementById('add-btn');
    const outputBtn = document.getElementById('output-btn');
    const amountInput = document.getElementById('amount-input');
    const outputAmountInput = document.getElementById('output-amount-input');
    const tabMalu = document.getElementById('tab-malu');
    const tabBabi = document.getElementById('tab-babi');
    
    const navHome = document.getElementById('nav-home');
    const navGoals = document.getElementById('nav-goals');
    const navHistory = document.getElementById('nav-history');
    const mobileNavHome = document.getElementById('mobile-nav-home');
    const mobileNavGoals = document.getElementById('mobile-nav-goals');
    const mobileNavHistory = document.getElementById('mobile-nav-history');
    const saveGoalsBtn = document.getElementById('save-goals-btn');
    const saveBalancesBtn = document.getElementById('save-balances-btn');
    const resetDataBtn = document.getElementById('reset-data-btn');

    if (loginBtn) {
        loginBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            try {
                console.log("Iniciando login com Google...");
                await signInWithPopup(auth, googleProvider);
                console.log("Login realizado com sucesso!");
            } catch (error: any) {
                console.error("Erro no login:", error);
                if (error.code === 'auth/popup-blocked') {
                    alert("O popup de login foi bloqueado pelo seu navegador. Por favor, permita popups para este site.");
                } else if (error.code === 'auth/cancelled-popup-request') {
                    // Ignorar cancelamento
                } else {
                    alert("Erro ao entrar: " + error.message);
                }
            }
        });
    }

    if (addBtn) {
        addBtn.addEventListener('click', (e) => {
            e.preventDefault();
            handleAddEntry();
        });
    }
    if (outputBtn) {
        outputBtn.addEventListener('click', (e) => {
            e.preventDefault();
            handleOutputEntry();
        });
    }
    
    amountInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleAddEntry(); });
    outputAmountInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleOutputEntry(); });

    if (tabMalu) {
        tabMalu.addEventListener('click', (e) => {
            e.preventDefault();
            switchTab('malu');
        });
    }
    if (tabBabi) {
        tabBabi.addEventListener('click', (e) => {
            e.preventDefault();
            switchTab('babi');
        });
    }

    if (navHome) navHome.addEventListener('click', (e) => { e.preventDefault(); switchView('home'); });
    if (navGoals) navGoals.addEventListener('click', (e) => { e.preventDefault(); switchView('goals'); });
    if (navHistory) navHistory.addEventListener('click', (e) => { e.preventDefault(); switchView('history'); });
    if (mobileNavHome) mobileNavHome.addEventListener('click', (e) => { e.preventDefault(); switchView('home'); });
    if (mobileNavGoals) mobileNavGoals.addEventListener('click', (e) => { e.preventDefault(); switchView('goals'); });
    if (mobileNavHistory) mobileNavHistory.addEventListener('click', (e) => { e.preventDefault(); switchView('history'); });
    if (saveGoalsBtn) {
        saveGoalsBtn.addEventListener('click', (e) => {
            e.preventDefault();
            handleSaveGoals();
        });
    }
    if (saveBalancesBtn) {
        saveBalancesBtn.addEventListener('click', (e) => {
            e.preventDefault();
            handleSaveBalances();
        });
    }

    if (resetDataBtn) {
        resetDataBtn.addEventListener('click', (e) => {
            e.preventDefault();
            handleResetData();
        });
    }

    // Botão de Backup
    const backupBtn = document.getElementById('backup-btn');
    if (backupBtn) {
        backupBtn.addEventListener('click', (e) => {
            e.preventDefault();
            handleBackupData();
        });
    }

    // Logout
    const mobileLogoutBtn = document.getElementById('mobile-logout-btn');
    
    const handleLogout = async () => {
        try {
            await auth.signOut();
            localStorage.clear();
            window.location.reload();
        } catch (error) {
            console.error('Erro ao sair:', error);
        }
    };

    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
    if (mobileLogoutBtn) mobileLogoutBtn.addEventListener('click', handleLogout);
}

/**
 * Troca de visualização (Home vs Metas)
 */
function switchView(view: string) {
    state.activeView = view;
    const homeView = document.getElementById('home-view');
    const goalsView = document.getElementById('goals-view');
    const historyView = document.getElementById('history-view');
    const navHome = document.getElementById('nav-home');
    const navGoals = document.getElementById('nav-goals');
    const navHistory = document.getElementById('nav-history');
    const mobileNavHome = document.getElementById('mobile-nav-home');
    const mobileNavGoals = document.getElementById('mobile-nav-goals');

    const activeColor = state.activeUser === 'babi' ? 'text-purple-600' : 'text-premium-blue';
    const inactiveColor = state.activeUser === 'babi' ? 'text-[#1a162e]' : 'text-white';

    // Reset all views
    if (homeView) homeView.classList.add('hidden');
    if (goalsView) goalsView.classList.add('hidden');
    if (historyView) historyView.classList.add('hidden');

    // Reset all navs
    [navHome, navGoals, navHistory].forEach(nav => {
        if (nav) {
            nav.classList.remove('sidebar-item-active');
            nav.classList.add('opacity-30');
            nav.style.borderColor = '';
            nav.style.color = '';
            nav.style.backgroundColor = '';
        }
    });

    if (view === 'home') {
        if (homeView) homeView.classList.remove('hidden');
        if (navHome) {
            navHome.classList.add('sidebar-item-active');
            navHome.classList.remove('opacity-30');
            if (state.activeUser === 'babi') {
                navHome.style.borderColor = '#a855f7';
                navHome.style.color = '#a855f7';
                navHome.style.backgroundColor = 'rgba(168, 85, 247, 0.1)';
            }
        }
        if (mobileNavHome) mobileNavHome.className = `flex flex-col items-center gap-1 ${activeColor}`;
        if (mobileNavGoals) mobileNavGoals.className = `flex flex-col items-center gap-1 ${inactiveColor} opacity-40`;
    } else if (view === 'goals') {
        if (goalsView) goalsView.classList.remove('hidden');
        if (navGoals) {
            navGoals.classList.add('sidebar-item-active');
            navGoals.classList.remove('opacity-30');
            if (state.activeUser === 'babi') {
                navGoals.style.borderColor = '#a855f7';
                navGoals.style.color = '#a855f7';
                navGoals.style.backgroundColor = 'rgba(168, 85, 247, 0.1)';
            }
        }
        if (mobileNavHome) mobileNavHome.className = `flex flex-col items-center gap-1 ${inactiveColor} opacity-40`;
        if (mobileNavGoals) mobileNavGoals.className = `flex flex-col items-center gap-1 ${activeColor}`;
        renderGoals();
    } else if (view === 'history') {
        if (historyView) historyView.classList.remove('hidden');
        if (navHistory) {
            navHistory.classList.add('sidebar-item-active');
            navHistory.classList.remove('opacity-30');
            if (state.activeUser === 'babi') {
                navHistory.style.borderColor = '#a855f7';
                navHistory.style.color = '#a855f7';
                navHistory.style.backgroundColor = 'rgba(168, 85, 247, 0.1)';
            }
        }
        renderHistory();
    }
}

/**
 * Adiciona uma entrada ao histórico
 */
function addHistoryEntry(type, amount, bankId, description) {
    const user = state.users[state.activeUser];
    if (!user.history) user.history = [];
    
    const entry = {
        id: Date.now().toString(),
        type,
        amount,
        bankId,
        timestamp: new Date().toISOString(),
        description
    };
    
    user.history.unshift(entry);
    
    // Limitar a 50 entradas para não sobrecarregar o Firestore
    if (user.history.length > 50) {
        user.history = user.history.slice(0, 50);
    }
}

/**
 * Renderiza o histórico
 */
function renderHistory() {
    const list = document.getElementById('history-list');
    const empty = document.getElementById('history-empty');
    if (!list || !empty) return;

    const history = state.users[state.activeUser].history || [];
    
    if (history.length === 0) {
        list.innerHTML = '';
        empty.classList.remove('hidden');
        return;
    }

    empty.classList.add('hidden');
    list.innerHTML = history.map(entry => {
        const date = new Date(entry.timestamp);
        const dateStr = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        const timeStr = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        
        const bank = PIGGY_BANKS_CONFIG.find(b => b.id === entry.bankId);
        const bankName = bank ? `${bank.icon} ${bank.name}` : '-';
        
        let typeLabel = '';
        let typeColor = '';
        
        switch (entry.type) {
            case 'income':
                typeLabel = 'Entrada';
                typeColor = 'text-premium-green';
                break;
            case 'expense':
                typeLabel = 'Gasto';
                typeColor = 'text-premium-red';
                break;
            case 'reset':
                typeLabel = 'Reset';
                typeColor = 'text-white/40';
                break;
            case 'adjustment':
                typeLabel = 'Ajuste';
                typeColor = 'text-premium-blue';
                break;
        }

        // Se for income, o bankName é "Distribuído"
        const displayBank = entry.type === 'income' ? 'Distribuído' : bankName;

        return `
            <tr class="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                <td class="py-4 pr-4 opacity-40">
                    <div class="flex flex-col">
                        <span>${dateStr}</span>
                        <span class="text-[8px] uppercase">${timeStr}</span>
                    </div>
                </td>
                <td class="py-4 pr-4">
                    <span class="px-2 py-0.5 rounded-full bg-white/5 text-[8px] font-bold uppercase tracking-widest ${typeColor}">${typeLabel}</span>
                </td>
                <td class="py-4 pr-4 font-medium opacity-80">${displayBank}</td>
                <td class="py-4 text-right font-bold ${typeColor}">
                    ${entry.type === 'income' ? '+' : entry.type === 'expense' ? '-' : ''} R$ ${formatCurrency(entry.amount)}
                </td>
            </tr>
        `;
    }).join('');
}

/**
 * Salva as metas no Firestore
 */
async function handleSaveGoals() {
    if (!state.currentUser) {
        alert('Por favor, faça login para salvar suas metas.');
        return;
    }

    const goalInputs = document.querySelectorAll('.goal-input');
    const newGoals: any = {};
    
    goalInputs.forEach(input => {
        const bankId = input.getAttribute('data-bank-id') || '';
        const val = parseFloat((input as HTMLInputElement).value) || 0;
        newGoals[bankId] = val;
    });

    const user = { ...state.users[state.activeUser] };
    user.goals = newGoals;
    
    addHistoryEntry('adjustment', 0, '', 'Metas atualizadas');

    await saveUserData(state.activeUser, user);
    alert('Metas salvas com sucesso! 🎉');
    switchView('home');
}

/**
 * Salva os saldos atuais no Firestore
 */
async function handleSaveBalances() {
    if (!state.currentUser) {
        alert('Por favor, faça login para salvar os saldos.');
        return;
    }

    const balanceInputs = document.querySelectorAll('.balance-input');
    const newBalances: any = {};
    
    balanceInputs.forEach(input => {
        const bankId = input.getAttribute('data-bank-id') || '';
        const val = parseFloat((input as HTMLInputElement).value) || 0;
        newBalances[bankId] = val;
    });

    const user = { ...state.users[state.activeUser] };
    user.balances = newBalances;
    
    addHistoryEntry('adjustment', 0, '', 'Saldos ajustados manualmente');

    await saveUserData(state.activeUser, user);
    alert('Saldos atualizados com sucesso! 💰');
    switchView('home');
}

/**
 * Troca de aba
 */
function switchTab(user) {
    if (state.activeUser === user) return;
    state.activeUser = user;
    applyTheme();
    renderAll();
    
    (document.getElementById('amount-input') as HTMLInputElement).value = '';
    (document.getElementById('output-amount-input') as HTMLInputElement).value = '';
    (document.getElementById('output-bank-select') as HTMLSelectElement).value = '';
}

/**
 * Lida com a ENTRADA
 */
async function handleAddEntry() {
    if (!state.currentUser) {
        alert('Por favor, faça login para salvar seus dados.');
        return;
    }

    const input = document.getElementById('amount-input') as HTMLInputElement;
    const value = parseFloat(input.value);

    if (isNaN(value) || value <= 0) {
        alert('Digite um valor válido para a mesada.');
        return;
    }

    const user = { ...state.users[state.activeUser] };
    user.balances = { ...user.balances };

    PIGGY_BANKS_CONFIG.forEach(bank => {
        const share = (value * bank.percent) / 100;
        user.balances[bank.id] = (user.balances[bank.id] || 0) + share;
    });

    user.totalIncome = (user.totalIncome || 0) + value;
    
    addHistoryEntry('income', value, '', `Mesada de R$ ${formatCurrency(value)} distribuída`);

    await saveUserData(state.activeUser, user);
    input.value = '';
}

/**
 * Lida com a SAÍDA
 */
async function handleOutputEntry() {
    if (!state.currentUser) {
        alert('Por favor, faça login para salvar seus dados.');
        return;
    }

    const input = document.getElementById('output-amount-input') as HTMLInputElement;
    const select = document.getElementById('output-bank-select') as HTMLSelectElement;
    const value = parseFloat(input.value);
    const bankId = select.value;

    if (isNaN(value) || value <= 0) {
        alert('Por favor, digite um valor maior que zero para o gasto. O sistema cuidará de subtrair o valor do cofrinho automaticamente.');
        return;
    }

    if (!bankId) {
        alert('Selecione um cofrinho para o gasto.');
        return;
    }

    const user = { ...state.users[state.activeUser] };
    user.balances = { ...user.balances };
    const currentBalance = user.balances[bankId] || 0;

    if (value > currentBalance) {
        alert(`Saldo insuficiente no cofrinho ${PIGGY_BANKS_CONFIG.find(b => b.id === bankId).name}. Saldo atual: R$ ${formatCurrency(currentBalance)}. Lembre-se de digitar o valor positivo do gasto (ex: 8.00).`);
        return;
    }

    user.balances[bankId] -= value;
    user.totalExpenses = (user.totalExpenses || 0) + value;
    
    addHistoryEntry('expense', value, bankId, `Gasto de R$ ${formatCurrency(value)}`);

    await saveUserData(state.activeUser, user);
    
    input.value = '';
    select.value = '';
}

/**
 * Mostra um modal customizado
 */
function showModal(title: string, message: string, onConfirm: () => void) {
    const modal = document.getElementById('custom-modal');
    const titleEl = document.getElementById('modal-title');
    const messageEl = document.getElementById('modal-message');
    const confirmBtn = document.getElementById('modal-confirm');
    const cancelBtn = document.getElementById('modal-cancel');

    if (!modal || !titleEl || !messageEl || !confirmBtn || !cancelBtn) return;

    titleEl.textContent = title;
    messageEl.textContent = message;
    modal.classList.remove('hidden');

    const cleanup = () => {
        modal.classList.add('hidden');
        confirmBtn.removeEventListener('click', confirmHandler);
        cancelBtn.removeEventListener('click', cancelHandler);
    };

    const confirmHandler = () => {
        onConfirm();
        cleanup();
    };

    const cancelHandler = () => {
        cleanup();
    };

    confirmBtn.addEventListener('click', confirmHandler);
    cancelBtn.addEventListener('click', cancelHandler);
}

/**
 * Zera todos os dados do usuário ativo
 */
async function handleResetData() {
    if (!state.currentUser) return;

    showModal(
        'Zerar Tudo?',
        'Tem certeza que deseja zerar todos os saldos e metas deste perfil? Esta ação não pode ser desfeita.',
        async () => {
            const emptyData = {
                balances: { frida: 0, bino: 0, deco: 0, edu: 0, cora: 0 },
                goals: { frida: 0, bino: 0, deco: 0, edu: 0, cora: 0 },
                totalIncome: 0,
                totalExpenses: 0,
                history: []
            };

            state.users[state.activeUser] = emptyData;
            addHistoryEntry('reset', 0, '', 'Dados zerados completamente');
            await saveUserData(state.activeUser, emptyData);
            
            renderAll();
            switchView('home');
        }
    );
}

/**
 * Faz o backup dos dados em um arquivo JSON
 */
function handleBackupData() {
    if (!state.currentUser) {
        alert('Faça login para baixar seus dados.');
        return;
    }

    const dataStr = JSON.stringify(state.users, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `backup_banco_meninas_${new Date().toISOString().split('T')[0]}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
}

/**
 * Formata moeda
 */
function formatCurrency(value) {
    return value.toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

document.addEventListener('DOMContentLoaded', init);

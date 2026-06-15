import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { collection, query, where, onSnapshot, doc, updateDoc, deleteDoc, runTransaction, getDocs, orderBy, writeBatch } from 'firebase/firestore'; 
import { auth, db } from '../firebaseConfig';
import { signOut } from 'firebase/auth';
import { useAccounts } from '../hooks/useAccounts';
import { getPriceYahoo, searchAssetYahoo, getForexRates, getHistoricalData } from '../utils/financeService';
import { getAiAssetPrice } from '../utils/aiService';
import { format } from 'date-fns';
import PACModal from './PACModal';
import AccountManager from './AccountManager';

// --- THEME DEFINITIONS (Palette Completa) ---
const THEME_COLORS = {
    // 1. SCURI & PREMIUM
    onyx:    { wrapper: 'bg-slate-100', sidebarActive: 'bg-slate-900 border-slate-900 text-white shadow-slate-400', accentText: 'text-slate-900', kpiValue: 'text-slate-900', bgSoft: 'bg-slate-200', iconBg: 'bg-slate-800', chartStroke: '#0f172a' },
    navy:    { wrapper: 'bg-blue-50',   sidebarActive: 'bg-blue-900 border-blue-900 text-white shadow-blue-300',    accentText: 'text-blue-900',  kpiValue: 'text-blue-900',  bgSoft: 'bg-blue-200',  iconBg: 'bg-blue-900',  chartStroke: '#1e3a8a' },
    forest:  { wrapper: 'bg-emerald-50',sidebarActive: 'bg-emerald-900 border-emerald-900 text-white shadow-emerald-300',accentText:'text-emerald-900',kpiValue:'text-emerald-900',bgSoft:'bg-emerald-200',iconBg:'bg-emerald-900',chartStroke:'#064e3b' },

    // 2. VIVACI & STANDARD
    blue:    { wrapper: 'bg-blue-50/60',   sidebarActive: 'bg-blue-600 border-blue-600 text-white shadow-blue-200',     accentText: 'text-blue-600',   kpiValue: 'text-blue-700',   bgSoft: 'bg-blue-50',   iconBg: 'bg-blue-600',   chartStroke: '#2563eb' },
    indigo:  { wrapper: 'bg-indigo-50/60', sidebarActive: 'bg-indigo-600 border-indigo-600 text-white shadow-indigo-200', accentText: 'text-indigo-600', kpiValue: 'text-indigo-700', bgSoft: 'bg-indigo-50', iconBg: 'bg-indigo-600', chartStroke: '#4f46e5' },
    emerald: { wrapper: 'bg-emerald-50/60',sidebarActive: 'bg-emerald-600 border-emerald-600 text-white shadow-emerald-200',accentText:'text-emerald-600',kpiValue:'text-emerald-700',bgSoft:'bg-emerald-50',iconBg:'bg-emerald-600',chartStroke:'#059669' },
    teal:    { wrapper: 'bg-teal-50/60',   sidebarActive: 'bg-teal-600 border-teal-600 text-white shadow-teal-200',     accentText: 'text-teal-600',   kpiValue: 'text-teal-700',   bgSoft: 'bg-teal-50',   iconBg: 'bg-teal-600',   chartStroke: '#0d9488' },
    cyan:    { wrapper: 'bg-cyan-50/60',   sidebarActive: 'bg-cyan-600 border-cyan-600 text-white shadow-cyan-200',     accentText: 'text-cyan-600',   kpiValue: 'text-cyan-700',   bgSoft: 'bg-cyan-50',   iconBg: 'bg-cyan-600',   chartStroke: '#0891b2' },
    sky:     { wrapper: 'bg-sky-50/60',    sidebarActive: 'bg-sky-600 border-sky-600 text-white shadow-sky-200',       accentText: 'text-sky-600',    kpiValue: 'text-sky-700',    bgSoft: 'bg-sky-50',    iconBg: 'bg-sky-600',    chartStroke: '#0284c7' },
    violet:  { wrapper: 'bg-violet-50/60', sidebarActive: 'bg-violet-600 border-violet-600 text-white shadow-violet-200', accentText: 'text-violet-600', kpiValue: 'text-violet-700', bgSoft: 'bg-violet-50', iconBg: 'bg-violet-600', chartStroke: '#7c3aed' },
    purple:  { wrapper: 'bg-purple-50/60', sidebarActive: 'bg-purple-600 border-purple-600 text-white shadow-purple-200', accentText: 'text-purple-600', kpiValue: 'text-purple-700', bgSoft: 'bg-purple-50', iconBg: 'bg-purple-600', chartStroke: '#9333ea' },
    fuchsia: { wrapper: 'bg-fuchsia-50/60',sidebarActive: 'bg-fuchsia-600 border-fuchsia-600 text-white shadow-fuchsia-200',accentText:'text-fuchsia-600',kpiValue:'text-fuchsia-700',bgSoft:'bg-fuchsia-50',iconBg:'bg-fuchsia-600',chartStroke:'#c026d3' },
    pink:    { wrapper: 'bg-pink-50/60',   sidebarActive: 'bg-pink-600 border-pink-600 text-white shadow-pink-200',     accentText: 'text-pink-600',   kpiValue: 'text-pink-700',   bgSoft: 'bg-pink-50',   iconBg: 'bg-pink-600',   chartStroke: '#db2777' },
    rose:    { wrapper: 'bg-rose-50/60',   sidebarActive: 'bg-rose-600 border-rose-600 text-white shadow-rose-200',     accentText: 'text-rose-600',   kpiValue: 'text-rose-700',   bgSoft: 'bg-rose-50',   iconBg: 'bg-rose-600',   chartStroke: '#e11d48' },

    // 3. CALDI & SOLARI
    gold:    { wrapper: 'bg-yellow-50/80', sidebarActive: 'bg-yellow-600 border-yellow-600 text-white shadow-yellow-200',accentText: 'text-yellow-700', kpiValue: 'text-yellow-800', bgSoft: 'bg-yellow-100',iconBg: 'bg-yellow-600', chartStroke: '#ca8a04' },
    amber:   { wrapper: 'bg-amber-50/60',  sidebarActive: 'bg-amber-500 border-amber-500 text-white shadow-amber-200',  accentText: 'text-amber-600',  kpiValue: 'text-amber-700',  bgSoft: 'bg-amber-50',  iconBg: 'bg-amber-500',  chartStroke: '#d97706' },
    orange:  { wrapper: 'bg-orange-50/60', sidebarActive: 'bg-orange-500 border-orange-500 text-white shadow-orange-200', accentText: 'text-orange-600', kpiValue: 'text-orange-700', bgSoft: 'bg-orange-50', iconBg: 'bg-orange-500', chartStroke: '#ea580c' },
    red:     { wrapper: 'bg-red-50/60',    sidebarActive: 'bg-red-600 border-red-600 text-white shadow-red-200',       accentText: 'text-red-600',    kpiValue: 'text-red-700',    bgSoft: 'bg-red-50',    iconBg: 'bg-red-600',    chartStroke: '#dc2626' },
    lime:    { wrapper: 'bg-lime-50/60',   sidebarActive: 'bg-lime-600 border-lime-600 text-white shadow-lime-200',     accentText: 'text-lime-700',   kpiValue: 'text-lime-800',   bgSoft: 'bg-lime-100',  iconBg: 'bg-lime-600',   chartStroke: '#65a30d' },
    yellow:  { wrapper: 'bg-yellow-50/60', sidebarActive: 'bg-yellow-500 border-yellow-500 text-white shadow-yellow-200', accentText: 'text-yellow-600', kpiValue: 'text-yellow-700', bgSoft: 'bg-yellow-50', iconBg: 'bg-yellow-500', chartStroke: '#ca8a04' },

    // 4. NEUTRI & SPECIALI
    ivory:   { wrapper: 'bg-[#FDFCF5]',    sidebarActive: 'bg-[#F2F0E9] border-[#E6E2D3] text-stone-800 shadow-sm shadow-[#E6E2D3]', accentText: 'text-stone-600', kpiValue: 'text-stone-800', bgSoft: 'bg-[#F2F0E9]', iconBg: 'bg-[#E6E2D3] text-stone-700', chartStroke: '#78716c' },
    stone:   { wrapper: 'bg-stone-100',    sidebarActive: 'bg-stone-500 border-stone-500 text-white shadow-stone-300', accentText: 'text-stone-600',  kpiValue: 'text-stone-700',  bgSoft: 'bg-stone-200', iconBg: 'bg-stone-500',  chartStroke: '#78716c' },
    slate:   { wrapper: 'bg-slate-100',    sidebarActive: 'bg-slate-600 border-slate-600 text-white shadow-slate-300', accentText: 'text-slate-600',  kpiValue: 'text-slate-700',  bgSoft: 'bg-slate-200', iconBg: 'bg-slate-600',  chartStroke: '#475569' },
    zinc:    { wrapper: 'bg-zinc-100',     sidebarActive: 'bg-zinc-600 border-zinc-600 text-white shadow-zinc-300',    accentText: 'text-zinc-600',   kpiValue: 'text-zinc-700',   bgSoft: 'bg-zinc-200',  iconBg: 'bg-zinc-600',   chartStroke: '#52525b' },
    gray:    { wrapper: 'bg-gray-100',     sidebarActive: 'bg-gray-600 border-gray-600 text-white shadow-gray-300',    accentText: 'text-gray-600',   kpiValue: 'text-gray-700',   bgSoft: 'bg-gray-200',  iconBg: 'bg-gray-600',   chartStroke: '#4b5563' },
    neutral: { wrapper: 'bg-neutral-100',  sidebarActive:'bg-neutral-600 border-neutral-600 text-white shadow-neutral-300',accentText:'text-neutral-600',kpiValue:'text-neutral-700',bgSoft:'bg-neutral-200',iconBg:'bg-neutral-600',chartStroke:'#525255'},
};

// --- CHART COMPONENT ---
const SimpleChart = ({ data, colorHex }) => {
    if (!data || data.length < 2) return <div className="h-48 flex items-center justify-center text-xs text-slate-400 font-medium">Dati non disponibili</div>;
    const width = 600; const height = 200; const padding = 20;
    const values = data.map(d => d.value); const min = Math.min(...values); const max = Math.max(...values); const range = max - min || 1;
    const getY = (val) => height - padding - ((val - min) / range) * (height - (padding * 2));
    const getX = (index) => (index / (data.length - 1)) * width;
    
    const linePath = data.map((d, i) => `${getX(i)},${getY(d.value)}`).join(' ');
    const areaPath = `${linePath} ${width},${height} 0,${height}`;
    const isPositive = data[data.length - 1].value >= data[0].value;
    const strokeColor = colorHex || (isPositive ? '#10b981' : '#f43f5e');
    const startDate = new Date(data[0].date).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' });
    const endDate = new Date(data[data.length - 1].date).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' });

    return (
        <div className="w-full h-48 overflow-hidden relative">
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full" preserveAspectRatio="none">
                <defs>
                    <linearGradient id={`gradient-${strokeColor.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={strokeColor} stopOpacity="0.2" />
                        <stop offset="100%" stopColor={strokeColor} stopOpacity="0" />
                    </linearGradient>
                </defs>
                <polyline points={areaPath} fill={`url(#gradient-${strokeColor.replace('#','')})`} stroke="none" />
                <polyline points={linePath} fill="none" stroke={strokeColor} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            </svg>
            <div className="absolute top-2 left-2 text-[10px] font-bold text-slate-400 bg-white/90 px-1.5 py-0.5 rounded shadow-sm border border-slate-100">Max: {max.toFixed(2)}</div>
            <div className="absolute bottom-2 left-2 text-[10px] font-bold text-slate-400 bg-white/90 px-1.5 py-0.5 rounded shadow-sm border border-slate-100">Min: {min.toFixed(2)}</div>
            <div className="absolute bottom-2 right-2 text-[10px] font-medium text-slate-400">{startDate} - {endDate}</div>
        </div>
    );
};

// --- ICONS ---
const Icons = {
    Wallet: () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>,
    ChartBar: () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>,
    TrendingUp: () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>,
    TrendingDown: () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" /></svg>,
    Search: () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>,
    Refresh: ({spin}) => <svg className={`w-4 h-4 ${spin ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>,
    Chip: () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" /></svg>,
    Alert: () => <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>,
    LightBulb: () => <svg className="w-5 h-5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>,
    Trash: () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>,
    Banknotes: () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>,
    Empty: () => <svg className="w-16 h-16 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>,
    ArrowUp: () => <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg>,
    ArrowDown: () => <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>,
    Minus: () => <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M20 12H4" /></svg>,
    Cog: () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
    Pencil: () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>,
    LockClosed: () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>,
    LockOpen: () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" /></svg>,
};

const formatCurrency = (amount, currency = 'EUR') => new Intl.NumberFormat('it-IT', { style: 'currency', currency: currency }).format(amount || 0);
const safeParseFloat = (val) => parseFloat(val.toString().replace(/,/g, '.').replace(/\s/g, '')) || 0;

function Investments() {
    const navigate = useNavigate();
    const location = useLocation();
    const user = auth.currentUser;
    const displayName = user?.displayName || user?.email;
    const { accounts, loading: accountsLoading } = useAccounts(user?.uid);
    const investmentAccounts = accounts.filter(a => a.type === 'investment');
    const transferAccounts = accounts.filter(a => a.type !== 'investment' && a.type !== 'credit');

    // --- STATE MANAGEMENT ---
    const [selectedAccountId, setSelectedAccountId] = useState(null);
    const activeAccount = investmentAccounts.find(a => a.id === selectedAccountId) || investmentAccounts[0];
    
    // SAFE THEME RESOLUTION
    const theme = (activeAccount && THEME_COLORS[activeAccount.color]) ? THEME_COLORS[activeAccount.color] : THEME_COLORS['blue'];

    // Dati
    const [allUserAssets, setAllUserAssets] = useState([]); // TUTTI GLI ASSET DELL'UTENTE (per sidebar)
    const [exchangeRates, setExchangeRates] = useState(null);
    const [pacs, setPacs] = useState([]); 
    
    // Account Manager Modal (Create & Edit)
    const [showAccountManager, setShowAccountManager] = useState(false);
    const [accountToEdit, setAccountToEdit] = useState(null);
    const [showManageMenu, setShowManageMenu] = useState(false); // Menu tendina gestione conto

    // Liquidity
    const [cashModalMode, setCashModalMode] = useState(null);
    const [cashInput, setCashInput] = useState('');
    const [targetAccountId, setTargetAccountId] = useState('');

    // Chart
    const [chartData, setChartData] = useState([]);
    const [loadingChart, setLoadingChart] = useState(false);
    const [chartRange, setChartRange] = useState('1mo');

    // Form & Search
    const [symbolQuery, setSymbolQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [hasSearched, setHasSearched] = useState(false);
    const [isinWarning, setIsinWarning] = useState(null);
    const [selectedSymbol, setSelectedSymbol] = useState(null);
    const [quantity, setQuantity] = useState('');
    const [avgPrice, setAvgPrice] = useState('');
    const [manualCurrentPrice, setManualCurrentPrice] = useState(''); 
    const [assetCurrency, setAssetCurrency] = useState('EUR');
    
    const [isSearching, setIsSearching] = useState(false);
    const [isAiLoading, setIsAiLoading] = useState(false);
    const [statusMessage, setStatusMessage] = useState('');
    const [isAiEstimatedPrice, setIsAiEstimatedPrice] = useState(false);
    const [aiSourceInfo, setAiSourceInfo] = useState('');

    const [expandedAssetId, setExpandedAssetId] = useState(null);
    const [assetHistory, setAssetHistory] = useState([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [editQuantity, setEditQuantity] = useState('');
    const [editAvgPrice, setEditAvgPrice] = useState('');
    const [editCurrentPrice, setEditCurrentPrice] = useState(''); 
    const [isRefreshing, setIsRefreshing] = useState(false);
    
    const [sellAsset, setSellAsset] = useState(null);
    const [sellMode, setSellMode] = useState('amount');
    const [sellValue, setSellValue] = useState('');
    const [showPACModal, setShowPACModal] = useState(false);

    // --- INITIALIZATION ---
    useEffect(() => { getForexRates().then(setExchangeRates); }, []);
    
    // Sync selezione conto
    useEffect(() => {
        if (location.state?.accountId) {
            setSelectedAccountId(location.state.accountId);
        } else if (investmentAccounts.length > 0 && !selectedAccountId) {
            setSelectedAccountId(investmentAccounts[0].id);
        }
    }, [investmentAccounts, location.state]);

    // Listener Dati (GLOBALE)
    useEffect(() => {
        if (!user) return;
        
        // 1. Fetch ALL Assets for User (per calcolare i totali nella sidebar)
        const qAllAssets = query(collection(db, 'assets'), where('userId', '==', user.uid));
        const unsubAssets = onSnapshot(qAllAssets, (snap) => {
            setAllUserAssets(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        // 2. Fetch PACs
        const qPacs = query(collection(db, 'transactions'), where('userId', '==', user.uid), where('isRecurring', '==', true), where('status', '==', 'scheduled'));
        const unsubPacs = onSnapshot(qPacs, (snap) => {
            const allPacs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            if (activeAccount) {
                setPacs(allPacs.filter(t => t.accountId === activeAccount.id || t.toAccountId === activeAccount.id));
            }
        });

        return () => { unsubAssets(); unsubPacs(); };
    }, [user, activeAccount]); 

    // Assets del conto corrente attivo (Memoized)
    const activeAssets = useMemo(() => {
        if (!activeAccount) return [];
        return allUserAssets.filter(a => a.accountId === activeAccount.id);
    }, [allUserAssets, activeAccount]);

    const handleLogout = async () => { await signOut(auth); navigate('/auth'); };
    const convertToEur = (price, currency) => { if (currency === 'EUR') return price; if (!exchangeRates || !exchangeRates[currency]) return price; return price / exchangeRates[currency]; };
    const getRelatedPAC = (asset) => { if (!asset || !pacs.length) return null; return pacs.find(p => p.relatedAssetSymbol === asset.symbol || (p.description && p.description.includes(asset.symbol))); };

    const handleAccountSwitch = (accId) => {
        setSelectedAccountId(accId);
        navigate('.', { state: { accountId: accId }, replace: true });
        setExpandedAssetId(null); setCashModalMode(null); setSymbolQuery(''); setShowManageMenu(false);
    };

    // --- MANAGE ACCOUNT LOGIC ---
    const handleCreateAccount = () => {
        setAccountToEdit(null); // Modalità creazione
        setShowAccountManager(true);
    };

    const handleEditAccount = () => {
        setAccountToEdit(activeAccount);
        setShowAccountManager(true);
        setShowManageMenu(false);
    };

    const handleCloseInvestAccount = async () => {
        if (!window.confirm("Archiviare questo portafoglio? Lo storico rimarrà visibile.")) return;
        try { await updateDoc(doc(db, 'accounts', activeAccount.id), { status: 'closed' }); setShowManageMenu(false); } catch (e) { alert("Errore: " + e.message); }
    };

    const handleReopenInvestAccount = async () => {
        try { await updateDoc(doc(db, 'accounts', activeAccount.id), { status: 'active' }); setShowManageMenu(false); } catch (e) { alert("Errore: " + e.message); }
    };

    const handleDeleteInvestAccount = async (deleteTrans) => {
        // Safety check: asset must be empty
        if (activeAssets.length > 0 && !deleteTrans) { 
            alert("Attenzione: Ci sono ancora asset nel portafoglio. Devi prima venderli o eliminarli, oppure scegliere 'Elimina Tutto'."); 
            return; 
        }

        if (!window.confirm("SEI SICURO? Questa operazione è irreversibile.")) return;

        try {
            const batch = writeBatch(db);
            
            // 1. Elimina Asset
            activeAssets.forEach(a => batch.delete(doc(db, 'assets', a.id)));
            
            // 2. Elimina Transazioni se richiesto (Nota: qui facciamo una query diretta per sicurezza)
            if (deleteTrans) {
                 const qT = query(collection(db, 'transactions'), where('accountId', '==', activeAccount.id));
                 const snapT = await getDocs(qT);
                 snapT.forEach(t => batch.delete(doc(db, 'transactions', t.id)));
            }

            // 3. Elimina Conto
            batch.delete(doc(db, 'accounts', activeAccount.id));
            
            await batch.commit();
            setShowManageMenu(false);
            // Il routing automatico sposterà la selezione al prossimo conto disponibile
        } catch (e) { alert("Errore eliminazione: " + e.message); }
    };


    // --- LIQUIDITY ---
    // --- GESTIONE TRASFERIMENTO REALE (GIROCONTO) ---
    // MODIFICA: Ora crea UNICA transazione di tipo 'transfer'
    const handleCashOperation = async (e) => {
        e.preventDefault(); 
        const val = safeParseFloat(cashInput); 
        if (val <= 0) return;
        
        // Verifica disponibilità fondi in base al tipo di operazione
        if (cashModalMode === 'deposit') {
            // Per il deposito (Entrata in Investimenti), dobbiamo controllare il conto Sorgente
            if (!targetAccountId) { alert("Seleziona il conto di provenienza"); return; }
            const sourceAcc = transferAccounts.find(a => a.id === targetAccountId);
            if (!sourceAcc) { alert("Conto sorgente non trovato"); return; }
            const sourceAvail = sourceAcc.type === 'credit' ? (sourceAcc.creditLimit + sourceAcc.balance) : sourceAcc.balance;
            if (val > sourceAvail) { alert(`Fondi insufficienti su ${sourceAcc.name}`); return; }
        } else {
            // Per il prelievo (Uscita da Investimenti), controlliamo la liquidità investimenti
            if (val > (activeAccount.cash || 0)) { alert("Liquidità insufficiente sul conto investimenti"); return; }
            if (!targetAccountId) { alert("Seleziona il conto di destinazione"); return; }
        }

        try { await runTransaction(db, async (t) => {
            const investRef = doc(db, 'accounts', activeAccount.id); 
            const investDoc = await t.get(investRef);
            
            // Lettura Conto Investimenti
            let investCash = (investDoc.data().cash !== undefined) ? investDoc.data().cash : investDoc.data().balance;
            let investBalance = investDoc.data().balance;
            
            // Lettura Conto Esterno (Sorgente o Destinazione)
            const otherRef = doc(db, 'accounts', targetAccountId);
            const otherDoc = await t.get(otherRef);
            if (!otherDoc.exists()) throw "Conto esterno non trovato";
            const otherData = otherDoc.data();
            let otherBalance = otherData.balance;
            let otherCash = (otherData.cash !== undefined) ? otherData.cash : otherBalance;

            if (cashModalMode === 'deposit') { 
                // DEPOSITO: Other (Sorgente) -> Invest (Destinazione)
                otherBalance -= val; 
                otherCash -= val;
                investCash += val; 
                investBalance += val;
                
                t.update(otherRef, { balance: otherBalance, cash: otherCash });
                t.update(investRef, { cash: investCash, balance: investBalance });

                // UNICA TRANSAZIONE: GIROCONTO
                const trRef = doc(collection(db, 'transactions'));
                t.set(trRef, { 
                    userId: user.uid, 
                    accountId: targetAccountId, // Sorgente (Conto Esterno)
                    toAccountId: activeAccount.id, // Destinazione (Investimenti)
                    amount: val, 
                    date: format(new Date(), 'yyyy-MM-dd'), 
                    type: 'transfer', 
                    category: 'Trasferimento', 
                    description: `Deposito su ${activeAccount.name}`, 
                    paymentMethod: 'Manuale', 
                    status: 'completed' 
                });

            } else { 
                // PRELIEVO: Invest (Sorgente) -> Other (Destinazione)
                investCash -= val; 
                investBalance -= val;
                otherBalance += val;
                otherCash += val;

                t.update(investRef, { cash: investCash, balance: investBalance });
                t.update(otherRef, { balance: otherBalance, cash: otherCash });

                // UNICA TRANSAZIONE: GIROCONTO
                const trRef = doc(collection(db, 'transactions'));
                t.set(trRef, { 
                    userId: user.uid, 
                    accountId: activeAccount.id, // Sorgente (Investimenti)
                    toAccountId: targetAccountId, // Destinazione (Conto Esterno)
                    amount: val, 
                    date: format(new Date(), 'yyyy-MM-dd'), 
                    type: 'transfer', 
                    category: 'Trasferimento', 
                    description: `Prelievo da ${activeAccount.name}`, 
                    paymentMethod: 'Manuale', 
                    status: 'completed' 
                });
            }
        }); 
        setCashModalMode(null); setCashInput(''); setTargetAccountId('');
        } catch (e) { alert("Errore operazione: " + e); }
    };

    // --- CHART ---
    const loadChart = async (asset, range) => { setLoadingChart(true); setChartRange(range); const data = await getHistoricalData(asset.symbol, range); setChartData(data); setLoadingChart(false); };

    // --- ASSETS LOGIC ---
    const handleSearch = async (e) => { e.preventDefault(); if(!symbolQuery)return; setIsSearching(true); setHasSearched(false); setSearchResults([]); setIsinWarning(null); const cleanQuery=symbolQuery.trim().toUpperCase(); const isISIN=/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(cleanQuery); try{ const results=await searchAssetYahoo(cleanQuery); const formatted=results.map(r=>({symbol:r.symbol,description:r.name,exchange:r.exchDisp})).slice(0,5); setSearchResults(formatted); setHasSearched(true); if(isISIN&&formatted.length>0){if(!/Milan|Xetra|Paris|Amsterdam|Stuttgart|Rome/i.test(formatted[0].exchange))setIsinWarning({type:'market-mismatch',message:`Trovato su ${formatted[0].exchange}.`,suggestion:"Cerca Ticker."});}else if(isISIN&&formatted.length===0)setIsinWarning({type:'no-results',message:"ISIN non trovato.",suggestion:"Cerca Ticker."}); }catch(e){console.error(e);}finally{setIsSearching(false);} };
    const handleSelectSymbol = async (res) => { setSelectedSymbol(res); setSearchResults([]); setSymbolQuery(res.symbol); setHasSearched(false); setIsinWarning(null); setStatusMessage(`Controllo ${res.exchange}...`); setIsAiEstimatedPrice(false); setAiSourceInfo(''); setManualCurrentPrice(''); setIsAiLoading(true); try{ let priceData=await getPriceYahoo(res.symbol); if(priceData&&priceData.price>0){setManualCurrentPrice(priceData.price.toString());setAssetCurrency(priceData.currency||'EUR');setStatusMessage(`Prezzo Live da ${priceData.exchangeName}`);}else{setStatusMessage('Analisi AI...');const aiData=await getAiAssetPrice(res.symbol,res.description);if(aiData&&aiData.price){setManualCurrentPrice(aiData.price.toString());setAssetCurrency(aiData.currency||'EUR');setIsAiEstimatedPrice(true);setAiSourceInfo(`Stima AI (${aiData.source})`);setStatusMessage('Prezzo AI');}else{setStatusMessage('Prezzo non disp.');}}}catch(e){setStatusMessage("Err.");}finally{setIsAiLoading(false);} };
    const handleAddAsset = async () => { if((!selectedSymbol&&!symbolQuery)||!quantity)return; const finalSymbol=selectedSymbol?selectedSymbol.symbol:symbolQuery.toUpperCase(); const finalName=selectedSymbol?selectedSymbol.description:symbolQuery.toUpperCase(); const numQty=safeParseFloat(quantity); const numAvgPrice=safeParseFloat(avgPrice); const numManualPrice=safeParseFloat(manualCurrentPrice); const currentPrice=numManualPrice||numAvgPrice||0; const costEur=numQty*numAvgPrice; const currentCash=activeAccount.cash!==undefined?activeAccount.cash:activeAccount.balance; if(currentCash<costEur)if(!window.confirm(`Liquidità insufficiente. Procedere?`))return; try{ await runTransaction(db,async(t)=>{ const ar=doc(db,'accounts',activeAccount.id);const ad=await t.get(ar);const oldCash=(ad.data().cash!==undefined)?ad.data().cash:ad.data().balance; t.update(ar,{cash:oldCash-costEur}); const assetRef=doc(collection(db,'assets')); t.set(assetRef,{userId:user.uid,accountId:activeAccount.id,symbol:finalSymbol,name:finalName,quantity:numQty,avgPrice:numAvgPrice,currentPrice:currentPrice,currency:assetCurrency,isAiEstimated:isAiEstimatedPrice,aiSource:isAiEstimatedPrice?aiSourceInfo:null,lastUpdated:new Date().toISOString()}); const transRef=doc(collection(db,'transactions')); t.set(transRef,{userId:user.uid,accountId:activeAccount.id,assetId:assetRef.id,date:new Date().toISOString().split('T')[0],amount:costEur,type:'expense',category:'Investimenti',description:`Acquisto ${finalSymbol}`,paymentMethod:activeAccount.name,isRecurring:false,status:'completed'}); }); setSymbolQuery('');setSearchResults([]);setSelectedSymbol(null);setQuantity('');setAvgPrice('');setManualCurrentPrice('');setAssetCurrency('EUR');setIsAiEstimatedPrice(false);setStatusMessage(''); }catch(e){alert("Errore:"+e.message);} };
    const handleRefreshPrices = async () => { setIsRefreshing(true);const newRates=await getForexRates();if(newRates)setExchangeRates(newRates);const updatedAssets=[];for(const asset of activeAssets){let price=null;let isAi=false;let source=null;const yahooData=await getPriceYahoo(asset.symbol);if(yahooData&&yahooData.price>0)price=yahooData.price;else{const aiData=await getAiAssetPrice(asset.symbol,asset.name);if(aiData&&aiData.price){price=aiData.price;isAi=true;source=aiData.source;}}if(price&&price>0){const updated={...asset,currentPrice:price,isAiEstimated:isAi,aiSource:source,lastUpdated:new Date().toISOString()};await updateDoc(doc(db,'assets',asset.id),{currentPrice:price,isAiEstimated:isAi,aiSource:source,lastUpdated:updated.lastUpdated});updatedAssets.push(updated);}else{updatedAssets.push(asset);}}const currentCash=activeAccount.cash||0;const assetsValueEur=updatedAssets.reduce((sum,a)=>sum+(a.quantity*convertToEur(a.currentPrice,a.currency||'EUR')),0);await updateDoc(doc(db,'accounts',activeAccount.id),{balance:currentCash+assetsValueEur});setIsRefreshing(false); };
    const handleExpand = async(asset)=>{if(expandedAssetId===asset.id){setExpandedAssetId(null);setChartData([]);return;}setExpandedAssetId(asset.id);setEditQuantity(asset.quantity);setEditAvgPrice(asset.avgPrice);setEditCurrentPrice(asset.currentPrice);setLoadingHistory(true);try{const q=query(collection(db,'transactions'),where('assetId','==',asset.id),where('userId','==',user.uid),orderBy('date','desc'));const snap=await getDocs(q);setAssetHistory(snap.docs.map(d=>({id:d.id,...d.data()})));}catch(e){setAssetHistory([]);}finally{setLoadingHistory(false);}loadChart(asset,'1mo');};
    const handleUpdateAsset = async(assetId)=>{try{await updateDoc(doc(db,'assets',assetId),{quantity:safeParseFloat(editQuantity),avgPrice:safeParseFloat(editAvgPrice),currentPrice:safeParseFloat(editCurrentPrice)});setExpandedAssetId(null);}catch(e){console.error(e);}};
    const handleDeleteAsset = async(assetId)=>{const asset=activeAssets.find(a=>a.id===assetId);const relatedPac=getRelatedPAC(asset);if(!window.confirm("Eliminare asset (correzione)?"))return;const cashBack=asset.quantity*asset.avgPrice;try{await runTransaction(db,async(t)=>{const ar=doc(db,'accounts',activeAccount.id);const ad=await t.get(ar);t.update(ar,{cash:((ad.data().cash!==undefined)?ad.data().cash:ad.data().balance)+cashBack});t.delete(doc(db,'assets',assetId));if(relatedPac)t.delete(doc(db,'transactions',relatedPac.id));});}catch(e){console.error(e);}};
    const openSellModal = (asset) => { setSellAsset(asset); setSellMode('amount'); setSellValue(''); };
    const handleExecuteSell = async (e) => { e.preventDefault(); if(!sellAsset||!sellValue)return; const numVal=safeParseFloat(sellValue); const priceEur=convertToEur(sellAsset.currentPrice,sellAsset.currency||'EUR'); let sellQty=(sellMode==='amount')?numVal/priceEur:numVal; let sellAmount=(sellMode==='amount')?numVal:sellQty*priceEur; if(sellQty>sellAsset.quantity){alert("Quote insufficienti!");return;} const relatedPac=getRelatedPAC(sellAsset); const isFullSale=Math.abs(sellQty-sellAsset.quantity)<0.0001; if(isFullSale&&relatedPac)if(window.confirm(`Interrompere PAC?`))await deleteDoc(doc(db,'transactions',relatedPac.id)); try{await runTransaction(db,async(t)=>{const ar=doc(db,'accounts',activeAccount.id);const ad=await t.get(ar);t.update(ar,{cash:((ad.data().cash!==undefined)?ad.data().cash:ad.data().balance)+sellAmount});const assetRef=doc(db,'assets',sellAsset.id);if(isFullSale)t.delete(assetRef);else t.update(assetRef,{quantity:sellAsset.quantity-sellQty});const tr=doc(collection(db,'transactions'));t.set(tr,{userId:user.uid,accountId:activeAccount.id,assetId:sellAsset.id,date:new Date().toISOString().split('T')[0],amount:sellAmount,type:'income',category:'Investimenti',description:`Vendita ${sellAsset.symbol}`,paymentMethod:activeAccount.name,isRecurring:false,status:'completed'});});setSellAsset(null);setExpandedAssetId(null);}catch(e){alert("Errore:"+e.message);} };
    const handleDeletePAC = async(pacId)=>{if(window.confirm("Stop PAC?"))await deleteDoc(doc(db,'transactions',pacId));};

    // Totali (su Active Assets)
    const totalInvested = activeAssets.reduce((sum, a) => sum + (a.quantity * a.avgPrice), 0);
    const totalValue = activeAssets.reduce((sum, a) => sum + (a.quantity * convertToEur(a.currentPrice, a.currency || 'EUR')), 0);
    const totalGain = totalValue - totalInvested;

    // --- LOADING & EMPTY STATES ---
    if (accountsLoading) return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
            <div className="text-center animate-pulse">
                <Icons.TrendingUp />
                <p className="text-sm font-bold text-slate-400 mt-2">Caricamento...</p>
            </div>
        </div>
    );

    if (investmentAccounts.length === 0) return (
        <div className="min-h-screen bg-slate-50 text-slate-800 font-sans">
            <nav className="bg-white border-b border-slate-200 sticky top-0 z-30">
                <div className="max-w-7xl mx-auto px-4 h-16 flex justify-between items-center">
                    <div className="flex items-center gap-2"><div className="bg-slate-200 rounded-lg p-1.5 text-slate-500"><Icons.TrendingUp /></div><h1 className="text-xl font-bold text-slate-700">Investimenti</h1></div>
                    <div className="flex items-center space-x-6">
                        <button onClick={() => navigate('/')} className="text-sm font-medium text-slate-500 hover:text-indigo-600">Dashboard</button>
                        
                        <div className="h-4 w-px bg-slate-200 hidden md:block"></div>
                        
                        <button onClick={() => navigate('/profile')} className="hidden md:flex items-center gap-2 text-sm text-slate-600 hover:text-indigo-600 transition group">
                            <span className="bg-slate-100 p-1 rounded-full group-hover:bg-indigo-50">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                            </span>
                            <span>Ciao, <strong className="font-semibold">{displayName}</strong></span>
                        </button>

                        <button onClick={handleLogout} className="text-sm font-medium text-rose-600 hover:text-rose-700">Logout</button>
                    </div>
                </div>
            </nav>
            <div className="max-w-md mx-auto mt-20 text-center p-8 bg-white rounded-2xl shadow-sm border border-slate-100">
                <div className="flex justify-center mb-6"><Icons.Empty /></div>
                <h2 className="text-xl font-bold text-slate-800 mb-2">Nessun conto investimenti</h2>
                <p className="text-slate-500 text-sm mb-6">Non hai ancora creato un portafoglio. Clicca qui sotto per iniziare il tuo percorso.</p>
                <button onClick={handleCreateAccount} className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-indigo-700 transition">Crea il tuo primo Portafoglio</button>
            </div>
            {/* Modal nascosto ma pronto per l'uso */}
            {showAccountManager && <AccountManager user={user} accounts={accounts} accountToEdit={accountToEdit} onClose={() => setShowAccountManager(false)} />}
        </div>
    );

    if (!activeAccount) return <div className="min-h-screen p-10 text-center">Seleziona un conto...</div>;

    return (
        <div className={`min-h-screen text-slate-800 font-sans pb-10 transition-colors duration-500 ${theme.wrapper}`}>
            <nav className="bg-white/80 backdrop-blur-md border-b border-white/20 sticky top-0 z-30 shadow-sm">
                <div className="max-w-7xl mx-auto px-4 h-16 flex justify-between items-center">
                    <div className="flex items-center gap-2"><div className={`rounded-lg p-1.5 text-white ${theme.iconBg}`}><Icons.TrendingUp /></div><h1 className="text-xl font-bold">Investimenti</h1></div>
                    <div className="flex items-center space-x-6">
                        <button onClick={() => navigate('/')} className="text-sm font-medium text-slate-500 hover:text-indigo-600">Dashboard</button>
                        
                        <div className="h-4 w-px bg-slate-200 hidden md:block"></div>
                        
                        <button onClick={() => navigate('/profile')} className="hidden md:flex items-center gap-2 text-sm text-slate-600 hover:text-indigo-600 transition group">
                            <span className="bg-slate-100 p-1 rounded-full group-hover:bg-indigo-50">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                            </span>
                            <span>Ciao, <strong className="font-semibold">{displayName}</strong></span>
                        </button>

                        <button onClick={handleLogout} className="text-sm font-medium text-rose-600 hover:text-rose-700">Logout</button>
                    </div>
                </div>
            </nav>

            <div className="max-w-7xl mx-auto px-4 mt-8">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                    
                    {/* SX: CONTI + LIQUIDITÀ */}
                    <div className="lg:col-span-3 space-y-6">
                        <div>
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex justify-between items-center">
                                Conti 
                                <button onClick={handleCreateAccount} className="text-[10px] bg-white border border-slate-300 hover:bg-slate-50 px-2 py-0.5 rounded text-slate-600 transition">+</button>
                            </h3>
                            {investmentAccounts.map(acc => {
                                const cardTheme = THEME_COLORS[acc.color] || THEME_COLORS['blue'];
                                const isActive = activeAccount.id === acc.id;
                                const isClosed = acc.status === 'closed';
                                
                                // CALCOLO PERFORMANCE PER CARD SIDEBAR
                                const accAssets = allUserAssets.filter(a => a.accountId === acc.id);
                                const accInvested = accAssets.reduce((sum, a) => sum + (a.quantity * a.avgPrice), 0);
                                const accCurrent = accAssets.reduce((sum, a) => sum + (a.quantity * convertToEur(a.currentPrice, a.currency || 'EUR')), 0);
                                const accDiff = accCurrent - accInvested;
                                
                                let ArrowIcon = Icons.Minus;
                                let arrowColor = 'text-slate-400';
                                if (accDiff > 0.01) { ArrowIcon = Icons.ArrowUp; arrowColor = 'text-emerald-500'; }
                                else if (accDiff < -0.01) { ArrowIcon = Icons.ArrowDown; arrowColor = 'text-rose-500'; }

                                return (
                                    <div key={acc.id} onClick={() => handleAccountSwitch(acc.id)} className={`p-4 rounded-xl border cursor-pointer transition-all flex items-center gap-3 mb-2 ${isActive ? `${cardTheme.sidebarActive}` : `bg-white/70 border-slate-200 hover:bg-white ${isClosed ? 'opacity-50 grayscale' : ''}`}`}>
                                        <div className={`p-2 rounded-lg ${isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-400'}`}><Icons.Wallet /></div>
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold block text-sm truncate w-24">{acc.name}</span>
                                                {isClosed && <span className="text-[8px] bg-black/20 text-white px-1 rounded">CHIUSO</span>}
                                            </div>
                                            <div className="flex justify-between items-center mt-0.5">
                                                <span className={`text-[10px] ${isActive ? 'opacity-90' : 'text-slate-400'}`}>{formatCurrency(acc.balance)}</span>
                                                {accInvested > 0 && <span className={`text-[10px] ${isActive ? 'bg-white/20 text-white' : 'bg-slate-50'} px-1.5 rounded flex items-center gap-0.5 ${!isActive ? arrowColor : ''}`}><ArrowIcon /></span>}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* LIQUIDITY CARD AGGIORNATA CON MENU GESTIONE */}
                        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 relative">
                            <div className="flex justify-between items-start mb-3">
                                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                                    Liquidità
                                    {activeAccount.status === 'closed' && <span className="ml-2 bg-red-100 text-red-600 px-1 rounded">CHIUSO</span>}
                                </h3>
                                
                                {/* TASTO MENU OPZIONI */}
                                <div className="relative">
                                    <button onClick={() => setShowManageMenu(!showManageMenu)} className="p-1 text-slate-400 hover:text-indigo-600 transition bg-slate-50 rounded-lg">
                                        <Icons.Cog />
                                    </button>

                                    {/* DROPDOWN MENU GESTIONE */}
                                    {showManageMenu && (
                                        <div className="absolute right-0 top-8 w-48 bg-white border border-slate-200 shadow-xl rounded-xl z-50 overflow-hidden animate-fadeIn">
                                            
                                            {/* Modifica Dati - FIX: Usa handleEditAccount */}
                                            <button 
                                                onClick={handleEditAccount} 
                                                className="w-full text-left px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-3 border-b border-slate-50 transition-colors"
                                            >
                                                <Icons.Pencil /> Modifica Dati
                                            </button>

                                            {/* Archivia / Riattiva */}
                                            {activeAccount.status === 'closed' ? (
                                                <button 
                                                    onClick={handleReopenInvestAccount} 
                                                    className="w-full text-left px-4 py-3 text-sm font-medium text-emerald-600 hover:bg-emerald-50 flex items-center gap-3 border-b border-slate-50 transition-colors"
                                                >
                                                    <Icons.LockOpen /> Riattiva
                                                </button>
                                            ) : (
                                                <button 
                                                    onClick={handleCloseInvestAccount} 
                                                    className="w-full text-left px-4 py-3 text-sm font-medium text-slate-500 hover:bg-slate-50 flex items-center gap-3 border-b border-slate-50 transition-colors"
                                                >
                                                    <Icons.LockClosed /> Archivia
                                                </button>
                                            )}

                                            {/* Elimina Tutto */}
                                            <button 
                                                onClick={() => handleDeleteInvestAccount(true)} 
                                                className="w-full text-left px-4 py-3 text-sm font-medium text-rose-600 hover:bg-rose-50 flex items-center gap-3 transition-colors"
                                            >
                                                <Icons.Trash /> Elimina Tutto
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="flex justify-between items-end mb-4">
                                <div>
                                    <span className="text-3xl font-bold text-slate-800">{formatCurrency(activeAccount.cash || 0)}</span>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border flex items-center gap-1 ${theme.bgSoft} ${theme.accentText} border-transparent`}>
                                            {(activeAccount.interestRate || 0).toFixed(1).replace('.0', '')}% p.a.
                                        </span>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-2">
                                <button onClick={() => setCashModalMode('deposit')} disabled={activeAccount.status === 'closed'} className="bg-slate-100 text-slate-600 py-2 rounded-lg text-xs font-bold hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed">Deposita</button>
                                <button onClick={() => setCashModalMode('withdraw')} disabled={activeAccount.status === 'closed'} className="bg-slate-100 text-slate-600 py-2 rounded-lg text-xs font-bold hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed">Preleva</button>
                            </div>

                            {cashModalMode && (
                                <form onSubmit={handleCashOperation} className="mt-3 bg-slate-50 p-3 rounded-lg border border-slate-200 animate-fadeIn">
                                    <p className="text-xs font-bold text-slate-500 mb-2">{cashModalMode === 'deposit' ? 'Versamento' : 'Prelievo verso:'}</p>
                                    
                                    {cashModalMode === 'withdraw' && (
                                        <select className="input-field py-1 text-xs mb-2" required value={targetAccountId} onChange={e => setTargetAccountId(e.target.value)}>
                                            <option value="" disabled>Deposita in...</option>
                                            {transferAccounts.map(a => <option key={a.id} value={a.id}>{a.name} ({formatCurrency(a.balance)})</option>)}
                                        </select>
                                    )}
                                    {cashModalMode === 'deposit' && (
                                        <select className="input-field py-1 text-xs mb-2" required value={targetAccountId} onChange={e => setTargetAccountId(e.target.value)}>
                                            <option value="" disabled>Versa da...</option>
                                            {transferAccounts.map(a => <option key={a.id} value={a.id}>{a.name} ({formatCurrency(a.balance)})</option>)}
                                        </select>
                                    )}

                                    <div className="flex gap-2">
                                        <input type="number" step="0.01" className="input-field py-1 text-sm" placeholder="€" value={cashInput} onChange={e => setCashInput(e.target.value)} autoFocus />
                                        <button type="submit" className="bg-slate-800 text-white px-3 rounded text-xs font-bold">VAI</button>
                                        <button type="button" onClick={() => { setCashModalMode(null); setCashInput(''); setTargetAccountId(''); }} className="text-slate-400 hover:text-rose-500 px-2">&times;</button>
                                    </div>
                                </form>
                            )}
                        </div>
                    </div>

                    {/* CENTRO: ASSETS */}
                    <div className="lg:col-span-6">
                        {/* KPI */}
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 mb-6 flex justify-between items-center relative overflow-hidden">
                            <div className={`absolute right-0 top-0 opacity-10 -mr-4 -mt-4 transform rotate-12 ${theme.accentText}`}><Icons.ChartBar /></div>
                            <div><p className="text-xs text-slate-400 uppercase font-bold">Valore Portafoglio</p><p className={`text-3xl font-bold tracking-tight ${theme.kpiValue}`}>{formatCurrency(totalValue)}</p></div>
                            <div className="text-right z-10"><p className="text-xs text-slate-400 uppercase font-bold">P&L Totale</p><p className={`text-xl font-bold flex items-center justify-end gap-1 ${totalGain >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{totalGain >= 0 ? <Icons.TrendingUp /> : <Icons.TrendingDown />}{formatCurrency(totalGain)}</p></div>
                        </div>

                        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden min-h-[400px]">
                            <div className={`px-6 py-4 border-b border-slate-50 flex justify-between items-center ${theme.bgSoft}`}>
                                <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm">Asset Allocation <button onClick={handleRefreshPrices} disabled={isRefreshing} className="text-[10px] text-indigo-600 bg-white border border-indigo-100 px-2 py-1 rounded-lg hover:bg-indigo-50 shadow-sm flex items-center gap-1 transition-all"><Icons.Refresh spin={isRefreshing} /> {isRefreshing ? '...' : 'Aggiorna'}</button></h3>
                                <div className="flex gap-2 relative">
                                    <div className="relative"><input type="text" placeholder="ISIN o Ticker..." className="input-field py-1.5 pl-8 text-sm w-40 uppercase rounded-r-none border-r-0 transition-all focus:w-56" value={symbolQuery} onChange={e => setSymbolQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch(e)} /><div className="absolute left-2 top-2 text-slate-400"><Icons.Search /></div></div>
                                    <button onClick={handleSearch} className="bg-white border border-l-0 border-slate-300 px-3 rounded-r-lg hover:bg-slate-50 text-slate-500 font-bold text-xs">VAI</button>
                                    {searchResults.length > 0 && (<div className="absolute top-full right-0 mt-2 w-72 bg-white border border-slate-200 shadow-xl rounded-xl z-50 overflow-hidden animate-fadeIn">{searchResults.map((res, idx) => (<div key={idx} onClick={() => handleSelectSymbol(res)} className="p-3 hover:bg-indigo-50 cursor-pointer border-b border-slate-50 last:border-0 flex justify-between items-center group"><div><div className="font-bold text-slate-800 group-hover:text-indigo-700">{res.symbol}</div><div className="text-[10px] text-slate-500 truncate w-40">{res.description}</div></div><span className="text-[9px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-400 font-bold">{res.exchange}</span></div>))}</div>)}
                                </div>
                            </div>

                            {isinWarning && (<div className={`px-6 py-3 border-b flex items-start gap-3 animate-fadeIn ${isinWarning.type === 'no-results' ? 'bg-red-50 border-red-100' : 'bg-amber-50 border-amber-100'}`}><div className="mt-0.5">{isinWarning.type === 'no-results' ? <Icons.Alert /> : <Icons.LightBulb />}</div><div><p className={`text-xs font-bold ${isinWarning.type === 'no-results' ? 'text-red-800' : 'text-indigo-800'}`}>{isinWarning.message}</p><p className={`text-[10px] ${isinWarning.type === 'no-results' ? 'text-red-600' : 'text-indigo-600'}`}>{isinWarning.suggestion}</p></div></div>)}
                            {selectedSymbol && (<div className="p-4 bg-indigo-50 border-b border-indigo-100 animate-fadeIn"><div className="flex justify-between items-start mb-3"><div className="flex items-center gap-2"><div className="bg-white p-1.5 rounded-lg shadow-sm text-indigo-600"><Icons.Chip /></div><div><span className="font-bold text-indigo-900 block text-sm">{selectedSymbol.symbol}</span><span className="text-[10px] text-indigo-600">{selectedSymbol.description}</span></div></div><button onClick={() => {setSelectedSymbol(null); setManualCurrentPrice(''); setStatusMessage('');}} className="text-slate-400 hover:text-rose-500 font-bold text-lg">&times;</button></div><div className="flex gap-2 items-end flex-wrap bg-white/50 p-3 rounded-xl border border-indigo-100/50"><div className="w-20"><label className="text-[9px] font-bold text-indigo-400 uppercase">Qta</label><input type="text" className="input-field py-1 text-sm bg-white" placeholder="0" value={quantity} onChange={e => setQuantity(e.target.value)} /></div><div className="w-24"><label className="text-[9px] font-bold text-indigo-400 uppercase">PMC</label><input type="text" className="input-field py-1 text-sm bg-white" placeholder="€" value={avgPrice} onChange={e => setAvgPrice(e.target.value)} /></div><div className="flex-grow min-w-[120px] relative"><label className="text-[9px] font-bold text-indigo-400 uppercase flex justify-between"><span>Prezzo</span>{isAiLoading && <span className="text-indigo-600 animate-pulse">Gemini AI...</span>}</label><div className="relative"><input type="text" className={`input-field py-1 text-sm ${isAiEstimatedPrice ? 'border-amber-400 bg-amber-50 text-amber-900' : 'bg-white'}`} value={manualCurrentPrice} onChange={e => setManualCurrentPrice(e.target.value)} />{isAiEstimatedPrice && <span className="absolute right-2 top-1.5 text-[10px]">✨ AI</span>}</div><span className="text-[9px] text-slate-400 absolute -bottom-4 left-0 truncate w-full">{statusMessage}</span></div><div className="w-16"><label className="text-[9px] font-bold text-indigo-400 uppercase">Valuta</label><select className="input-field py-1 text-sm p-0 bg-white" value={assetCurrency} onChange={e => setAssetCurrency(e.target.value)}><option value="EUR">EUR</option><option value="USD">USD</option></select></div><button onClick={handleAddAsset} disabled={!quantity || isAiLoading} className="bg-indigo-600 text-white px-4 py-1.5 rounded-lg text-xs font-bold shadow-sm hover:bg-indigo-700 h-[34px] ml-auto disabled:opacity-50">Aggiungi</button></div></div>)}

                            <div className="divide-y divide-slate-50">
                                {activeAssets.map(asset => {
                                    const valueEur = asset.quantity * convertToEur(asset.currentPrice, asset.currency || 'EUR'); const gainEur = valueEur - (asset.quantity * asset.avgPrice); const gainPercent = asset.avgPrice > 0 ? (gainEur / (asset.quantity * asset.avgPrice)) * 100 : 0; const isExpanded = expandedAssetId === asset.id; const relatedPac = getRelatedPAC(asset);
                                    return (
                                        <div key={asset.id} className="bg-white hover:bg-slate-50 transition group">
                                            <div onClick={() => handleExpand(asset)} className="p-4 flex justify-between items-center cursor-pointer">
                                                <div className="flex items-center gap-3"><div className={`p-2 rounded-lg ${gainEur >= 0 ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>{gainEur >= 0 ? <Icons.TrendingUp /> : <Icons.TrendingDown />}</div><div><div className="flex items-center gap-2"><span className="font-bold text-slate-800">{asset.symbol}</span><span className="text-[9px] bg-slate-100 px-1.5 rounded text-slate-500 font-bold border border-slate-200">{asset.currency}</span>{relatedPac && <span className="text-[9px] bg-blue-100 text-blue-700 px-1.5 rounded border border-blue-200 font-bold">PAC ATTIVO</span>}{asset.isAiEstimated && <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 rounded border border-amber-200 font-bold">✨ AI</span>}</div><p className="text-xs text-slate-400 mt-0.5">{asset.quantity} quote • PMC {formatCurrency(asset.avgPrice)}</p></div></div>
                                                <div className="text-right"><p className="font-mono font-bold text-sm text-slate-800">{formatCurrency(valueEur)}</p><p className={`text-[10px] font-bold ${gainEur >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{gainEur >= 0 ? '+' : ''}{formatCurrency(gainEur)} ({gainPercent.toFixed(1)}%)</p></div>
                                            </div>
                                            {isExpanded && (
                                                <div className={`p-4 border-t border-slate-100 border-b shadow-inner animate-fadeIn ${theme.bgSoft}`}>
                                                    <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4 shadow-sm">
                                                        <div className="flex justify-between items-center mb-2"><h5 className="text-[10px] font-bold text-slate-400 uppercase">Performance</h5><div className="flex gap-1">{['1mo','3mo','1y'].map(r => (<button key={r} onClick={() => loadChart(asset, r)} className={`px-2 py-0.5 text-[10px] rounded font-bold ${chartRange === r ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500'}`}>{r}</button>))}</div></div>
                                                        {loadingChart ? (<div className="h-48 flex items-center justify-center text-xs text-slate-400 animate-pulse">Caricamento grafico...</div>) : (<SimpleChart data={chartData} colorHex={theme.chartStroke} />)}
                                                    </div>
                                                    <div className="flex items-end gap-2 mb-4 bg-white p-3 rounded-xl border border-slate-200 shadow-sm"><div className="flex-1"><label className="text-[9px] font-bold text-slate-400 uppercase">Qta</label><input type="text" className="input-field text-sm py-1 bg-slate-50" value={editQuantity} onChange={e => setEditQuantity(e.target.value)} /></div><div className="flex-1"><label className="text-[9px] font-bold text-slate-400 uppercase">PMC</label><input type="text" className="input-field text-sm py-1 bg-slate-50" value={editAvgPrice} onChange={e => setEditAvgPrice(e.target.value)} /></div><div className="flex-1"><label className="text-[9px] font-bold text-slate-400 uppercase">Mkt</label><input type="text" className="input-field text-sm py-1 border-dashed border-indigo-300 bg-indigo-50/30" value={editCurrentPrice} onChange={e => setEditCurrentPrice(e.target.value)} /></div><button onClick={() => handleUpdateAsset(asset.id)} className="bg-slate-200 text-slate-600 px-3 py-1 rounded-lg text-xs font-bold hover:bg-slate-300 h-[32px]">Salva</button></div>
                                                    <div className="flex gap-2 mb-4"><button onClick={() => openSellModal(asset)} className="flex-1 bg-emerald-600 text-white py-2 rounded-lg text-xs font-bold shadow-sm hover:bg-emerald-700 flex justify-center items-center gap-2"><Icons.Banknotes /> VENDI (Trade)</button><button onClick={() => handleDeleteAsset(asset.id)} className="flex-1 bg-white border border-rose-200 text-rose-600 py-2 rounded-lg text-xs font-bold shadow-sm hover:bg-rose-50 flex justify-center items-center gap-2"><Icons.Trash /> ELIMINA (Errore)</button></div>
                                                    <div><h5 className="text-[10px] font-bold text-slate-400 uppercase mb-2 flex items-center gap-1"><Icons.ChartBar /> Storico Movimenti</h5>{loadingHistory ? <p className="text-xs text-slate-400 animate-pulse">Caricamento...</p> : assetHistory.length > 0 ? (<ul className="divide-y divide-slate-100 text-xs bg-white rounded-xl border border-slate-200 overflow-hidden">{assetHistory.map(tx => (<li key={tx.id} className="p-3 flex justify-between text-slate-600 hover:bg-slate-50"><span>{format(new Date(tx.date), 'dd MMM yy')}</span><span className="truncate max-w-[120px] font-medium">{tx.description}</span><span className={`font-bold ${tx.type === 'income' ? 'text-emerald-600' : 'text-slate-800'}`}>{tx.type === 'expense' ? '-' : '+'}{formatCurrency(tx.amount)}</span></li>))}</ul>) : <p className="text-xs text-slate-400 italic">Nessun movimento registrato.</p>}</div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                                {activeAssets.length === 0 && <div className="p-12 text-center flex flex-col items-center justify-center text-slate-300"><Icons.Wallet /><p className="text-sm font-medium mt-2">Nessun asset in portafoglio.</p><p className="text-xs">Usa la barra di ricerca per iniziare.</p></div>}
                            </div>
                        </div>
                    </div>

                    {/* DX: PAC */}
                    <div className="lg:col-span-3 space-y-6">
                        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
                            <div className="flex justify-between items-center mb-4"><h3 className="font-bold text-xs text-slate-400 uppercase tracking-wider">PAC Attivi</h3><button onClick={() => setShowPACModal(true)} disabled={activeAccount.status === 'closed'} className="text-xs bg-emerald-50 text-emerald-600 border border-emerald-100 px-2 py-1 rounded-lg font-bold hover:bg-emerald-100 transition disabled:opacity-50">+</button></div>
                            <div className="space-y-3">{pacs.map(pac => (<div key={pac.id} className="p-3 border border-slate-200 rounded-xl bg-slate-50 group hover:border-emerald-300 transition relative"><div className="flex justify-between items-start"><h4 className="font-bold text-sm text-slate-700 truncate w-32">{pac.description}</h4></div><div className="mt-2 flex justify-between items-end"><span className="text-[10px] bg-white px-2 py-0.5 rounded border border-slate-100 text-slate-500">{pac.paymentMethod}</span><span className="font-mono font-bold text-emerald-600 text-sm">{formatCurrency(pac.amount)}</span></div></div>))}{pacs.length === 0 && <p className="text-xs text-slate-400 italic">Nessun PAC attivo.</p>}</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* SELL MODAL */}
            {sellAsset && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex justify-center items-center z-50 p-4 animate-fadeIn">
                    <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden">
                        <div className="bg-emerald-600 px-6 py-4 flex justify-between items-center text-white"><h3 className="font-bold text-lg flex items-center gap-2"><Icons.Banknotes /> Vendita</h3><button onClick={() => setSellAsset(null)} className="text-emerald-100 hover:text-white text-2xl leading-none">&times;</button></div>
                        <div className="p-6">
                            <div className="mb-4"><span className="text-xs font-bold text-slate-400 uppercase block mb-1">Asset</span><div className="font-bold text-xl text-slate-800">{sellAsset.symbol}</div><div className="text-sm text-slate-500">{sellAsset.name}</div></div>
                            <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 mb-6 flex justify-between items-center"><span className="text-xs font-bold text-slate-500">In Portafoglio:</span><span className="font-mono font-bold text-slate-700">{sellAsset.quantity} quote</span></div>
                            <form onSubmit={handleExecuteSell}>
                                <div className="mb-6">
                                    <div className="flex bg-slate-100 p-1 rounded-lg mb-3"><button type="button" onClick={() => setSellMode('amount')} className={`flex-1 py-1.5 text-xs font-bold rounded-md transition ${sellMode === 'amount' ? 'bg-white shadow text-emerald-600' : 'text-slate-500'}`}>Importo (€)</button><button type="button" onClick={() => setSellMode('quantity')} className={`flex-1 py-1.5 text-xs font-bold rounded-md transition ${sellMode === 'quantity' ? 'bg-white shadow text-emerald-600' : 'text-slate-500'}`}>Quote (n.)</button></div>
                                    <div className="relative"><input type="number" step="any" className="w-full text-center text-3xl font-bold py-2 border-b-2 border-slate-200 focus:border-emerald-500 outline-none bg-transparent" placeholder="0" value={sellValue} onChange={e => setSellValue(e.target.value)} autoFocus /><span className="absolute right-0 bottom-3 text-slate-400 font-bold">{sellMode === 'amount' ? 'EUR' : 'Unit'}</span></div>
                                    {sellValue && (<p className="text-center text-xs text-slate-400 mt-2">{sellMode === 'amount' ? `~ ${(parseFloat(sellValue) / convertToEur(sellAsset.currentPrice, sellAsset.currency)).toFixed(4)} quote` : `~ ${formatCurrency(parseFloat(sellValue) * convertToEur(sellAsset.currentPrice, sellAsset.currency))}`}</p>)}
                                </div>
                                <button type="submit" className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold shadow-lg hover:bg-emerald-700 transition transform active:scale-95">Conferma Vendita</button>
                            </form>
                        </div>
                    </div>
                </div>
            )}
            
            {showPACModal && <PACModal user={user} accounts={accounts} onClose={() => setShowPACModal(false)} />}
            
            {/* AGGIUNTO: Modale Account Manager per Create & Edit */}
            {showAccountManager && (
                <AccountManager 
                    user={user} 
                    accounts={accounts} 
                    accountToEdit={accountToEdit} 
                    onClose={() => setShowAccountManager(false)} 
                />
            )}
        </div>
    );
}

export default Investments;
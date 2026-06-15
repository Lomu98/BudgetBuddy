// src/utils/financeService.js

// Utilizziamo un proxy CORS pubblico per permettere al browser di chiamare le API di Yahoo.
// Nota: In un ambiente di produzione backend server-side, questo non servirebbe.
const CORS_PROXY = "https://corsproxy.io/?"; 
const YAHOO_SEARCH_URL = "https://query1.finance.yahoo.com/v1/finance/search";
const YAHOO_CHART_URL = "https://query2.finance.yahoo.com/v8/finance/chart";

/**
 * Cerca asset per Nome o ISIN.
 * Restituisce TUTTI i risultati trovati, ordinati per rilevanza "Europea".
 */
export const searchAssetYahoo = async (query) => {
    if (!query) return [];
    try {
        // Aumentiamo quotesCount a 20 per assicurarci di vedere tutte le piazze (Londra, Milano, Xetra, ecc.)
        const url = `${CORS_PROXY}${encodeURIComponent(`${YAHOO_SEARCH_URL}?q=${query}&quotesCount=20&newsCount=0`)}`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (!data.quotes || data.quotes.length === 0) return [];

        return data.quotes
            .filter(q => q.quoteType === 'ETF' || q.quoteType === 'EQUITY')
            .map(q => ({
                symbol: q.symbol,       // Es: EUNL.DE
                name: q.shortname || q.longname,
                exchDisp: q.exchDisp,   // Es: "Xetra", "Milan", "London"
                score: calculatePriorityScore(q) // Punteggio per l'ordinamento
            }))
            // Ordiniamo: Chi ha score più alto va in cima (Xetra/Milan), ma NON nascondiamo gli altri.
            .sort((a, b) => b.score - a.score);
    } catch (error) {
        console.error("Errore Yahoo Search:", error);
        return [];
    }
};

/**
 * Helper per dare priorità visiva ai mercati Eurozona
 */
const calculatePriorityScore = (quote) => {
    let score = 0;
    const exch = (quote.exchDisp || "").toLowerCase();
    const symbol = (quote.symbol || "").toLowerCase();

    // Priorità massima: Xetra (Germania) e Milano -> Ottimi per investitori italiani/Scalable
    if (exch.includes("xetra") || symbol.includes(".de")) score += 100;
    else if (exch.includes("milan") || symbol.includes(".mi")) score += 90;
    else if (exch.includes("paris") || symbol.includes(".pa")) score += 80;
    else if (exch.includes("amsterdam") || symbol.includes(".as")) score += 80;
    
    // Penalità lievi per mercati spesso in valuta estera (ma li mostriamo comunque)
    else if (exch.includes("london") || symbol.includes(".l")) score -= 10;
    else if (exch.includes("nasdaq") || exch.includes("nyse")) score -= 20;

    return score;
};

/**
 * Recupera il prezzo attuale (real-time o differito 15min) dato un Ticker specifico.
 */
export const getPriceYahoo = async (ticker) => {
    if (!ticker) return null;
    try {
        const url = `${CORS_PROXY}${encodeURIComponent(`${YAHOO_CHART_URL}/${ticker}?interval=1d&range=1d`)}`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (!data.chart || !data.chart.result || data.chart.result.length === 0) return null;

        const result = data.chart.result[0];
        const meta = result.meta;

        return {
            price: meta.regularMarketPrice,
            currency: meta.currency,
            date: new Date(meta.regularMarketTime * 1000).toISOString(),
            marketTime: meta.regularMarketTime,
            previousClose: meta.chartPreviousClose,
            symbol: meta.symbol,
            exchangeName: meta.exchangeName
        };
    } catch (error) {
        console.error("Errore Yahoo Price:", error);
        return null;
    }
};

/**
 * Tassi di cambio gratuiti (BCE)
 */
export const getForexRates = async () => {
    try {
        const response = await fetch("https://api.frankfurter.app/latest?from=EUR");
        if (!response.ok) return null;
        const data = await response.json();
        return data.rates; 
    } catch (error) {
        console.warn("Errore forex, uso fallback");
        return { USD: 1.05, GBP: 0.85 }; 
    }
};

/**
 * Recupera storico prezzi per i grafici (es. range '1mo', '3mo', '1y')
 * NUOVA FUNZIONE AGGIUNTA
 */
export const getHistoricalData = async (symbol, range = '1mo', interval = '1d') => {
    if (!symbol) return [];
    try {
        const url = `${CORS_PROXY}${encodeURIComponent(`${YAHOO_CHART_URL}/${symbol}?interval=${interval}&range=${range}`)}`;
        const response = await fetch(url);
        const data = await response.json();

        if (!data.chart || !data.chart.result || data.chart.result.length === 0) return [];

        const result = data.chart.result[0];
        const timestamps = result.timestamp || [];
        const quotes = result.indicators.quote[0] || {};
        const opens = quotes.open || []; 

        // Filtra nulls e crea array oggetti { date, value }
        const history = timestamps.map((t, i) => ({
            date: new Date(t * 1000).toISOString(),
            value: opens[i]
        })).filter(item => item.value !== null && item.value !== undefined);

        return history;
    } catch (error) {
        console.error("Errore Chart Data:", error);
        return [];
    }
};
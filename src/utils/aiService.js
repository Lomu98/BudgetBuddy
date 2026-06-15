// src/utils/aiService.js
import { GoogleGenerativeAI } from "@google/generative-ai";
import { searchAssetYahoo, getPriceYahoo } from './financeService';

// Inserisci la tua chiave qui (o meglio in .env come VITE_GEMINI_API_KEY)
const API_KEY = "AIzaSyA26jQINsrJdiP3rYZ4_ae7C_1ZJwBY0MA"; 

const genAI = new GoogleGenerativeAI(API_KEY);

// Definizione del Tool che Gemini può usare
const tools = [
  {
    functionDeclarations: [
      {
        name: "get_market_data",
        description: "Recupera il prezzo attuale di mercato di un titolo o ETF dato il suo ISIN o Ticker.",
        parameters: {
          type: "OBJECT",
          properties: {
            identifier: {
              type: "STRING",
              description: "ISIN (es. IE00B4L5Y983) o Simbolo (es. SWDA.MI)",
            },
          },
          required: ["identifier"],
        },
      },
    ],
  },
];

const model = genAI.getGenerativeModel({ 
    model: "gemini-flash-latest",
    tools: tools,
});

/**
 * Funzione principale per ottenere il prezzo via AI (con dati reali).
 */
export const getAiAssetPrice = async (identifier, description) => {
    
    // Avviamo la chat session abilitando i tools
    const chat = model.startChat();

    const prompt = `
        Trova il prezzo attuale per: "${identifier}" (${description || ''}).
        
        Istruzioni:
        1. Se è un ISIN, usa lo strumento 'get_market_data' per trovare il ticker migliore (preferisci mercati Euro come Xetra o Milano).
        2. Restituisci un JSON rigoroso con i dati che hai trovato.
        
        Formato JSON richiesto:
        {
            "price": number,
            "currency": "EUR" (o altra),
            "date": "YYYY-MM-DD",
            "source": "Nome Mercato (es. Xetra)",
            "symbol": "TickerTrovato"
        }
    `;

    try {
        // 1. Invio prompt a Gemini
        const result = await chat.sendMessage(prompt);
        const call = result.response.functionCalls()?.[0];

        if (call) {
            // 2. Gemini ha chiesto di chiamare la funzione
            const query = call.args.identifier;
            console.log("🤖 Gemini Function Call per:", query);

            // Eseguiamo la ricerca locale tramite il nostro service
            const searchRes = await searchAssetYahoo(query);
            
            if (!searchRes || searchRes.length === 0) return null;

            // Prendiamo il primo risultato (il nostro service li ha già ordinati per priorità Xetra/Milan)
            const bestMatch = searchRes[0]; 
            
            // Scarichiamo il prezzo
            const priceData = await getPriceYahoo(bestMatch.symbol);

            // 3. Inviamo il risultato tecnico indietro a Gemini
            const functionResponse = [
                {
                    functionResponse: {
                        name: "get_market_data",
                        response: { result: priceData, marketInfo: bestMatch }
                    }
                }
            ];

            const finalResult = await chat.sendMessage(functionResponse);
            
            // 4. Gemini elabora e ci risponde col JSON pulito
            const text = finalResult.response.text()
                .replace(/```json/g, '')
                .replace(/```/g, '')
                .trim();
            
            return JSON.parse(text);
        } else {
            console.warn("Gemini non ha attivato il Function Calling.");
            return null;
        }

    } catch (error) {
        console.error("Errore AI Service:", error);
        return null;
    }
};


export const getSmartCategorization = async (description, existingCategories) => {
    if (!description) return null;

    const categoriesStr = existingCategories.length > 0 
        ? existingCategories.join(", ") 
        : "Cibo, Trasporti, Casa, Svago, Salute, Abbonamenti, Shopping, Stipendio, Investimenti";

    const prompt = `
        Analizza questa transazione: "${description}".
        
        Compiti:
        1. Scegli la Categoria migliore tra: [${categoriesStr}]. Se nessuna va bene, inventane una (max 1 parola).
        2. Determina se è 'expense' o 'income'.
        
        Rispondi SOLO con questo JSON (nient'altro):
        {
            "category": "NomeCategoria",
            "type": "expense" o "income"
        }
    `;

    try {
        const result = await model.generateContent(prompt);
        const response = result.response;
        let text = response.text();
        
        // Pulizia per assicurarsi che sia JSON valido (rimuove eventuali backticks del markdown)
        text = text.replace(/```json/g, '').replace(/```/g, '').trim();
        
        return JSON.parse(text);

    } catch (error) {
        console.error("Errore Gemini:", error);
        return null;
    }
};

export const getFinancialAdvice = async (financialData) => {
    const prompt = `
        Sei un coach finanziario amichevole e motivante.
        Dati utente questo mese:
        - Entrate: ${financialData.income}€
        - Uscite: ${financialData.expense}€
        - Bilancio: ${financialData.balance}€
        - Spesa maggiore in: ${financialData.topCategory}
        
        Dammi un consiglio breve (massimo 2 frasi) e pratico in italiano. Usa emoji.
    `;

    try {
        const result = await model.generateContent(prompt);
        return result.response.text();
    } catch (error) {
        console.error("Errore Gemini Coach:", error);
        return "Ottimo lavoro nel monitorare le tue spese! Continua così per raggiungere i tuoi obiettivi. 🚀";
    }
};

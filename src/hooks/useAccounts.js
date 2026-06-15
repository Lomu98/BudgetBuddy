import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebaseConfig';

export function useAccounts(userId) {
    const [accounts, setAccounts] = useState([]);
    const [totalNetWorth, setTotalNetWorth] = useState(0);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!userId) {
            setLoading(false);
            return;
        }

        const q = query(collection(db, 'accounts'), where('userId', '==', userId));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const accs = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            // Calcolo Patrimonio Totale (Solo conti attivi)
            // Usiamo parseFloat per sicurezza, anche se nel DB dovrebbero essere numeri
            const total = accs
                .filter(acc => acc.status !== 'closed')
                .reduce((sum, acc) => sum + (parseFloat(acc.balance) || 0), 0);

            setAccounts(accs);
            setTotalNetWorth(total);
            setLoading(false);
        }, (error) => {
            console.error("Errore fetch accounts:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [userId]);

    // Ritorniamo tutto ciò che serve alle viste
    return { accounts, totalNetWorth, loading };
}
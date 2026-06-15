import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../firebaseConfig';

export const useUserSuggestions = (userId) => {
    const [categories, setCategories] = useState([]);
    const [paymentMethods, setPaymentMethods] = useState([]);

    useEffect(() => {
        if (!userId) return;

        const fetchSuggestions = async () => {
            try {
                // Prendiamo le ultime 500 transazioni per costruire lo storico
                // È un buon compromesso tra performance e completezza
                const q = query(
                    collection(db, 'transactions'),
                    where('userId', '==', userId),
                    orderBy('date', 'desc'),
                    limit(500)
                );

                const snapshot = await getDocs(q);
                
                const uniqueCategories = new Set();
                const uniqueMethods = new Set();

                snapshot.docs.forEach(doc => {
                    const data = doc.data();
                    if (data.category) uniqueCategories.add(data.category.trim());
                    if (data.paymentMethod) uniqueMethods.add(data.paymentMethod.trim());
                });

                // Convertiamo in array e ordiniamo alfabeticamente
                setCategories(Array.from(uniqueCategories).sort());
                setPaymentMethods(Array.from(uniqueMethods).sort());

            } catch (error) {
                console.error("Errore nel recupero suggerimenti:", error);
            }
        };

        fetchSuggestions();
    }, [userId]);

    return { categories, paymentMethods };
};
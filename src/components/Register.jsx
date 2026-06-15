import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createUserWithEmailAndPassword, updateProfile, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';

function Register() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  // Registrazione Email/Password Classica
  const handleRegister = async (e) => {
    e.preventDefault();
    setError(null);

    try {
      // 1. Crea Utente Auth
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // 2. Aggiorna il "Display Name"
      await updateProfile(user, { displayName: username });

      // 3. Crea il documento utente nel DB
      await setDoc(doc(db, 'users', user.uid), {
        username: username,
        email: email,
        createdAt: new Date().toISOString(),
        authProvider: 'email'
      });

      navigate('/'); 
    } catch (e) {
      console.error("Errore di registrazione:", e);
      let errorMsg = "Si è verificato un errore durante la registrazione.";
      if (e.code === 'auth/email-already-in-use') errorMsg = "Questa email è già associata a un account.";
      else if (e.code === 'auth/weak-password') errorMsg = "La password deve contenere almeno 6 caratteri.";
      else if (e.code === 'auth/invalid-email') errorMsg = "Il formato dell'email non è valido.";
      setError(errorMsg);
    }
  };

  // Registrazione/Login con Google
  const handleGoogleRegister = async () => {
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      // Controlliamo se l'utente esiste già nel DB (per non sovrascrivere dati esistenti)
      const userDocRef = doc(db, 'users', user.uid);
      const userDocSnap = await getDoc(userDocRef);

      if (!userDocSnap.exists()) {
        // Se è la prima volta, creiamo il profilo
        await setDoc(userDocRef, {
          username: user.displayName || 'Utente Google',
          email: user.email,
          createdAt: new Date().toISOString(),
          authProvider: 'google'
        });
      }

      navigate('/');
    } catch (error) {
      console.error(error);
      setError("Errore durante la registrazione con Google.");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-4 font-sans">
      <div className="mb-8 text-center">
         <div className="bg-indigo-600 w-12 h-12 rounded-xl mx-auto flex items-center justify-center mb-3 shadow-lg shadow-indigo-200">
            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>
         </div>
         <h1 className="text-3xl font-bold text-slate-800 tracking-tight">BudgetBuddy</h1>
         <p className="text-slate-500 mt-2">Inizia a gestire le tue finanze oggi.</p>
      </div>

      <div className="card-modern w-full max-w-md bg-white p-8 rounded-2xl shadow-xl border border-slate-100">
        <h2 className="text-xl font-bold text-slate-800 mb-6">Crea un Account</h2>
        {error && (
          <div className="bg-rose-50 border border-rose-100 text-rose-600 px-4 py-3 rounded-xl mb-4 text-sm font-medium flex items-center">
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleRegister} className="space-y-5">
          <div>
            <label htmlFor="username" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Nome Utente</label>
            <input type="text" required value={username} onChange={(e) => setUsername(e.target.value)} className="input-field w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:ring-2 focus:ring-indigo-100 transition-all outline-none" placeholder="Es. MarioRossi" />
          </div>

          <div>
            <label htmlFor="email" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Email</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="input-field w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:ring-2 focus:ring-indigo-100 transition-all outline-none" placeholder="nome@esempio.com" />
          </div>
          <div>
            <label htmlFor="password" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Password</label>
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="input-field w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:ring-2 focus:ring-indigo-100 transition-all outline-none" placeholder="Scegli una password sicura" />
            <p className="text-xs text-slate-400 mt-2 text-right">Minimo 6 caratteri</p>
          </div>
          <button type="submit" className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 transition shadow-lg shadow-indigo-200">Registrati</button>
        </form>

        <div className="mt-6">
          <div className="relative">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200"></div></div>
            <div className="relative flex justify-center text-sm"><span className="px-2 bg-white text-slate-400">Oppure registrati con</span></div>
          </div>

          <button onClick={handleGoogleRegister} type="button" className="mt-4 w-full flex items-center justify-center gap-3 px-4 py-2.5 border border-slate-300 rounded-xl shadow-sm bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
            <svg className="h-5 w-5" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.26.81-.58z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
            Google
          </button>
        </div>

        <div className="mt-6 pt-6 border-t border-slate-100 text-center text-sm text-slate-500">
          Hai già un account? <button type="button" onClick={() => navigate('/auth')} className="font-semibold text-indigo-600 hover:text-indigo-700 transition-colors">Accedi qui</button>
        </div>
      </div>
    </div>
  );
}

export default Register;
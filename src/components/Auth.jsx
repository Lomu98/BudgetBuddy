import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword 
} from 'firebase/auth';
import { auth } from '../firebaseConfig'; // Importa l'istanza Auth

function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  // Funzione che gestisce sia Login che Registrazione
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
      navigate('/'); 

    } catch (err) {
      console.error("Errore di autenticazione:", err);
      let errorMessage = 'Si è verificato un errore sconosciuto.';
      if (err.code === 'auth/invalid-email') {
        errorMessage = 'Formato email non valido.';
      } else if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        errorMessage = 'Credenziali non valide.';
      } else if (err.code === 'auth/weak-password') {
        errorMessage = 'La password deve contenere almeno 6 caratteri.';
      } else if (err.code === 'auth/email-already-in-use') {
        errorMessage = 'Questa email è già registrata.';
      }
      setError(errorMessage);
    }
  };

  return (
    <div className="bg-gray-100 flex items-center justify-center h-screen">
      <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-lg">
        <h2 className="text-3xl font-bold text-center text-slate-800 mb-2">
          {isLogin ? 'Bentornato!' : 'Crea il tuo Account'}
        </h2>
        <p className="text-center text-gray-500 mb-8">
          {isLogin ? 'Accedi per continuare.' : 'Inizia a gestire le tue finanze oggi.'}
        </p>

        {error && (
          /* Usa red standard per l'errore */
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg relative mb-4" role="alert">
            <span className="block sm:inline">{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email</label>
            <input 
              type="email" 
              id="email" 
              required 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              /* Usa indigo standard per focus */
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">Password</label>
            <input 
              type="password" 
              id="password" 
              required 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              /* Usa indigo standard per focus */
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
          <div>
            <button 
              type="submit" 
              /* Usa indigo standard per il bottone */
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              {isLogin ? 'Accedi' : 'Registrati'}
            </button>
          </div>
        </form>

        <p className="mt-8 text-center text-sm text-gray-600">
          {isLogin ? 'Non hai un account?' : 'Hai già un account?'}
          <button 
            type="button" 
            onClick={() => setIsLogin(!isLogin)}
            /* Usa indigo standard per link */
            className="font-medium text-indigo-600 hover:text-indigo-500 ml-1"
          >
            {isLogin ? 'Registrati' : 'Accedi'}
          </button>
        </p>
      </div>
    </div>
  );
}

export default Auth;
import React from 'react';
import './Login.css';
import logo from '../logo_palpitaco.png';

function Login({ onLogin }) {
  const handleLogin = () => {
    if (onLogin) onLogin(); // simula login
  };

  return (
    <div className="login-container">
      <img src={logo} alt="Logo PalPitaco" className="logo animated-logo" />

      <h1 className="fade-in">Bem-vindo ao <strong>PalPitaco</strong></h1>
      <p className="fade-in-delay">O app onde cada pitaco tem sua estratégia de valor.</p>

      <input type="text" placeholder="CPF" className="login-input fade-in" />
      <input type="password" placeholder="Senha" className="login-input fade-in-delay" />
      <button className="login-button pulse" onClick={handleLogin}>ENTRAR</button>

      <p className="forgot-password fade-in-delay">Esqueceu sua senha?</p>
    </div>
  );
}

export default Login;

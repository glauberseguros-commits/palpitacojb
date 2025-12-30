import React from 'react';
import './Filtros.css';

const Filtros = ({ filtroGrupo, setFiltroGrupo, filtroHorario, setFiltroHorario, filtroDiaSemana, setFiltroDiaSemana }) => {
  return (
    <div className="filtros-container">
      <select value={filtroGrupo} onChange={e => setFiltroGrupo(e.target.value)}>
        <option value="">Grupo</option>
        {[...Array(25)].map((_, i) => (
          <option key={i + 1} value={i + 1}>{String(i + 1).padStart(2, '0')}</option>
        ))}
      </select>

      <select value={filtroHorario} onChange={e => setFiltroHorario(e.target.value)}>
        <option value="">Horário</option>
        <option value="manhã">Manhã</option>
        <option value="tarde">Tarde</option>
        <option value="noite">Noite</option>
      </select>

      <select value={filtroDiaSemana} onChange={e => setFiltroDiaSemana(e.target.value)}>
        <option value="">Dia da Semana</option>
        <option value="segunda">Segunda</option>
        <option value="terça">Terça</option>
        <option value="quarta">Quarta</option>
        <option value="quinta">Quinta</option>
        <option value="sexta">Sexta</option>
        <option value="sábado">Sábado</option>
        <option value="domingo">Domingo</option>
      </select>
    </div>
  );
};

export default Filtros;

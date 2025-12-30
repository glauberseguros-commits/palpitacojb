import React from 'react';
import './TOP3/GraficoRanking.css';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip
} from 'recharts';

function GraficoRanking({ rankingData }) {
  return (
    <div style={{ width: '100%', height: 300, marginTop: '40px' }}>
      <ResponsiveContainer>
        <BarChart data={rankingData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="animal" />
          <YAxis />
          <Tooltip />
          <Bar dataKey="qtd" fill="#ffd700" radius={[5, 5, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default GraficoRanking;

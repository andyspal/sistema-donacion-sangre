import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import './index.css';
import { Protegida, SesionProvider } from './sesion';
import { Inicio } from './pages/publico/Inicio';
import { Ingresar } from './pages/publico/Ingresar';
import { Registro } from './pages/publico/Registro';
import { DonanteLayout } from './layouts/DonanteLayout';
import { Tablero } from './pages/donante/Tablero';
import { Cuestionario } from './pages/donante/Cuestionario';
import { Estudios } from './pages/donante/Estudios';
import { Orientacion } from './pages/donante/Orientacion';
import { Turnos } from './pages/donante/Turnos';
import { Historial } from './pages/donante/Historial';
import { Autoexclusion } from './pages/donante/Autoexclusion';
import { Avisos } from './pages/donante/Avisos';
import { Perfil } from './pages/donante/Perfil';
import { HospitalLayout } from './layouts/HospitalLayout';
import { Agenda } from './pages/hospital/Agenda';
import { Postulantes } from './pages/hospital/Postulantes';
import { Legajo } from './pages/hospital/Legajo';
import { Inventario } from './pages/hospital/Inventario';
import { Convocatorias } from './pages/hospital/Convocatorias';
import { Autoexclusiones } from './pages/hospital/Autoexclusiones';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <SesionProvider>
        <Routes>
          <Route path="/" element={<Inicio />} />
          <Route path="/ingresar" element={<Ingresar />} />
          <Route path="/registro" element={<Registro />} />

          <Route path="/app" element={<Protegida para="DONANTE"><DonanteLayout /></Protegida>}>
            <Route index element={<Tablero />} />
            <Route path="cuestionario" element={<Cuestionario />} />
            <Route path="estudios" element={<Estudios />} />
            <Route path="orientacion" element={<Orientacion />} />
            <Route path="turnos" element={<Turnos />} />
            <Route path="historial" element={<Historial />} />
            <Route path="autoexclusion" element={<Autoexclusion />} />
            <Route path="avisos" element={<Avisos />} />
            <Route path="perfil" element={<Perfil />} />
          </Route>

          <Route path="/hospital" element={<Protegida para="PERSONAL"><HospitalLayout /></Protegida>}>
            <Route index element={<Agenda />} />
            <Route path="postulantes" element={<Postulantes />} />
            <Route path="postulantes/:id" element={<Legajo />} />
            <Route path="inventario" element={<Inventario />} />
            <Route path="convocatorias" element={<Convocatorias />} />
            <Route path="autoexclusiones" element={<Autoexclusiones />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </SesionProvider>
    </BrowserRouter>
  </StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => { void navigator.serviceWorker.register('/sw.js'); });
}

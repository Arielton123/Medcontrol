import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// O nome do repositório deve corresponder ao base usado no GitHub Pages.
export default defineConfig({
  plugins: [react()],
  base: '/medcontrol/',
});

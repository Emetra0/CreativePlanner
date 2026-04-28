import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;

          if (id.includes('reactflow')) return 'reactflow';
          if (id.includes('@tiptap')) return 'tiptap';
          if (id.includes('lucide-react')) return 'icons';
          if (id.includes('date-fns')) return 'date-utils';
          if (id.includes('qrcode') || id.includes('jszip') || id.includes('mammoth') || id.includes('docx')) return 'document-tools';
        },
      },
    },
  },
  server: {
    port: 3000,
    strictPort: true,
  },
  preview: {
    port: 3000,
    strictPort: true,
  },
});

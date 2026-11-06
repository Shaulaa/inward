import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rolldownOptions: {
      output: {
        // Libraries in their own chunks: they change far less often than the
        // app code, so returning visitors keep them cached across deploys.
        codeSplitting: {
          groups: [
            { name: 'three', test: /node_modules[\/]three[\/]/ },
            { name: 'vendor', test: /node_modules[\/]/ },
          ],
        },
      },
    },
    // three.js on its own is ~575 kB minified (~143 kB gzip); that chunk is expected.
    chunkSizeWarningLimit: 600,
  },
});

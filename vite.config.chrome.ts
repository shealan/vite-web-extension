import { resolve } from 'path';
import { readFileSync, writeFileSync } from 'fs';
import { mergeConfig, defineConfig } from 'vite';
import { crx, ManifestV3Export } from '@crxjs/vite-plugin';
import baseConfig, { baseManifest, baseBuildOptions } from './vite.config.base'

const outDir = resolve(__dirname, 'dist_chrome');

// Plugin to fix web_accessible_resources after CRXJS build
function fixWebAccessibleResources() {
  return {
    name: 'fix-web-accessible-resources',
    closeBundle() {
      const manifestPath = resolve(outDir, 'manifest.json');
      try {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));

        // Ensure injected.js is in web_accessible_resources
        const hasInjected = manifest.web_accessible_resources?.some(
          (r: { resources: string[] }) => r.resources?.includes('injected.js')
        );

        if (!hasInjected) {
          manifest.web_accessible_resources = manifest.web_accessible_resources || [];
          manifest.web_accessible_resources.push({
            resources: ['injected.js'],
            matches: ['<all_urls>'],
          });
          writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
          console.log('[fix-web-accessible-resources] Added injected.js to manifest');
        }
      } catch (e) {
        console.error('[fix-web-accessible-resources] Error:', e);
      }
    },
  };
}

export default mergeConfig(
  baseConfig,
  defineConfig({
    plugins: [
      crx({
        manifest: {
          ...baseManifest,
          background: {
            service_worker: 'src/pages/background/index.ts',
            type: 'module'
          },
        } as ManifestV3Export,
        browser: 'chrome',
        contentScripts: {
          injectCss: true,
        }
      }),
      fixWebAccessibleResources(),
    ],
    build: {
      ...baseBuildOptions,
      outDir,
      rollupOptions: {
        input: {
          panel: resolve(__dirname, 'src/pages/panel/index.html'),
        },
      },
    },
  })
)
import type { Configuration } from '@rspack/core';
import { resolve } from 'path';

import pkg from './package.json';

// 获取 Electron 相关的依赖，这些应该被 externalize
const getElectronExternals = () => {
  // 读取 package.json 获取所有依赖
  const allDeps = {
    ...(pkg.dependencies || {}),
    ...(pkg.devDependencies || {}),
  };

  // 返回需要被 externalize 的包
  // workspace 包（@monorepo/*）应该被打包，不应该被 externalize
  return Object.keys(allDeps).filter((dep) => {
    // 排除 workspace 包 - 这些应该被打包
    if (dep.startsWith('@monorepo/')) {
      return false;
    }

    // 排除 rspack 相关的包和构建工具
    if (
      dep.startsWith('@rspack/') ||
      dep.startsWith('rspack') ||
      dep === 'typescript' ||
      dep === 'eslint'
    ) {
      return false;
    }

    // electron 本身必须被 externalize（已在 externals 数组中单独列出）
    if (dep === 'electron') {
      return false;
    }

    // 其他 node_modules 中的包应该被 externalize
    return true;
  });
};

// 根据环境变量决定构建目标
const buildTarget = (process.env.RSPACK_TARGET || 'main') as 'main' | 'preload';

const createConfig = (target: 'main' | 'preload'): Configuration => {
  const isMain = target === 'main';
  const isProduction = process.env.NODE_ENV === 'production';

  // 构建 externals 对象
  const externalsList = getElectronExternals();
  const externalsObj: Record<string, string> = {
    electron: 'commonjs electron',
  };

  // 为每个需要 externalize 的包创建映射
  externalsList.forEach((dep) => {
    externalsObj[dep] = `commonjs ${dep}`;
  });

  return {
    target: isMain ? 'electron-main' : 'electron-preload',
    entry: isMain ? './src/main/index.ts' : './src/preload/index.ts',
    output: {
      path: resolve(__dirname, `out/${target}`),
      filename: 'index.js',
      clean: isProduction, // 生产环境清理输出目录
    },
    externals: externalsObj,
    resolve: {
      extensions: ['.ts', '.js', '.json'],
    },
    module: {
      rules: [
        {
          test: /\.ts$/,
          use: [
            {
              loader: 'builtin:swc-loader',
              options: {
                jsc: {
                  parser: {
                    syntax: 'typescript',
                    tsx: false,
                  },
                  target: 'es2020',
                  loose: false,
                  externalHelpers: false,
                },
                minify: isProduction,
              },
            },
          ],
          exclude: /node_modules/,
        },
      ],
    },
    mode: isProduction ? 'production' : 'development',
    devtool: isProduction ? false : 'source-map',
    optimization: {
      minimize: isProduction,
    },
  };
};

// 根据构建目标返回相应配置
export default createConfig(buildTarget);

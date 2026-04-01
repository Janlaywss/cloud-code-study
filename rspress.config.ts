import * as path from 'node:path';
import { defineConfig } from '@rspress/core';

export default defineConfig({
  root: path.join(__dirname, 'docs'),
  title: 'Cloud Code Study',
  icon: '/rspress-icon.png',
  logo: {
    light: '/rspress-light-logo.png',
    dark: '/rspress-dark-logo.png',
  },
  themeConfig: {
    socialLinks: [
      {
        icon: 'github',
        mode: 'link',
        content: 'https://github.com/Janlaywss/cloud-code-study',
      },
    ],
    footer: {
      message: '基于 Cloud Code 源码的学习笔记，仅供学习交流',
    },
  },
  markdown: {
    mdxRs: false,
  },
});

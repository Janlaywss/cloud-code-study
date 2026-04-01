import './index.css';
import { Layout as BasicLayout } from '@rspress/core/theme-original';
import { Analytics } from '@vercel/analytics/react';
import type React from 'react';

// Wrap Layout to inject Vercel Web Analytics
const Layout = (props: React.ComponentProps<typeof BasicLayout>) => (
  <>
    <BasicLayout {...props} />
    <Analytics />
  </>
);

export * from '@rspress/core/theme-original';
export { Layout };

import React from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { ThemeProvider, createTheme, CssBaseline, Box, Button, Drawer, List, ListItemButton,
  ListItemIcon, ListItemText, AppBar, Toolbar, Typography, useMediaQuery } from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import DnsIcon from '@mui/icons-material/Dns';
import SecurityIcon from '@mui/icons-material/Security';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import SettingsIcon from '@mui/icons-material/Settings';
import IntegrationInstructionsIcon from '@mui/icons-material/IntegrationInstructions';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import LogoutIcon from '@mui/icons-material/Logout';
import { api } from './api';

import ErrorBoundary from './ErrorBoundary';
import Dashboard from './pages/Dashboard';
import DnsManager from './pages/DnsManager';
import CertManager from './pages/CertManager';
import CaSetup from './pages/CaSetup';
import Settings from './pages/Settings';
import Integrations from './pages/Integrations';
import ProxyManager from './pages/ProxyManager';
import Login from './pages/Login';

const DRAWER_WIDTH = 240;

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#90caf9' },
    secondary: { main: '#f48fb1' },
    background: { default: '#121212', paper: '#1e1e1e' },
  },
});

const navItems = [
  { label: 'Dashboard', path: '/', icon: <DashboardIcon /> },
  { label: 'DNS Manager', path: '/dns', icon: <DnsIcon /> },
  { label: 'Certificates', path: '/certs', icon: <SecurityIcon /> },
  { label: 'CA Setup', path: '/ca', icon: <VerifiedUserIcon /> },
  { label: 'Reverse Proxy', path: '/proxy', icon: <SwapHorizIcon /> },
  { label: 'Integrations', path: '/integrations', icon: <IntegrationInstructionsIcon /> },
  { label: 'Settings', path: '/settings', icon: <SettingsIcon /> },
];

function NavContent() {
  const location = useLocation();
  return (
    <List>
      {navItems.map(item => (
        <ListItemButton key={item.path} component={Link} to={item.path}
          selected={location.pathname === item.path}>
          <ListItemIcon>{item.icon}</ListItemIcon>
          <ListItemText primary={item.label} />
        </ListItemButton>
      ))}
    </List>
  );
}

export default function App() {
  const isMobile = useMediaQuery('(max-width:768px)');
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [authState, setAuthState] = React.useState(null); // null=loading, {authenticated, hasPassword}

  React.useEffect(() => {
    api.authStatus().then(setAuthState).catch(() => setAuthState({ authenticated: true, hasPassword: false }));
  }, []);

  const handleLogout = async () => {
    await api.authLogout();
    setAuthState(s => ({ ...s, authenticated: false }));
  };

  if (authState === null) return null; // loading

  if (!authState.authenticated) {
    return (
      <ThemeProvider theme={darkTheme}>
        <CssBaseline />
        <Login
          firstRun={!authState.hasPassword}
          onLogin={() => setAuthState(s => ({ ...s, authenticated: true, hasPassword: true }))}
        />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <BrowserRouter>
        <Box sx={{ display: 'flex' }}>
          <AppBar position="fixed" sx={{ zIndex: (t) => t.zIndex.drawer + 1 }}>
            <Toolbar>
              <Typography variant="h6" noWrap sx={{ flexGrow: 1 }}>
                🔐 LAN Cert Manager
              </Typography>
              <Button color="inherit" startIcon={<LogoutIcon />} onClick={handleLogout} size="small">
                Logout
              </Button>
            </Toolbar>
          </AppBar>

          <Drawer variant={isMobile ? 'temporary' : 'permanent'}
            open={!isMobile || mobileOpen} onClose={() => setMobileOpen(false)}
            sx={{ width: DRAWER_WIDTH, '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box' } }}>
            <Toolbar />
            <NavContent />
          </Drawer>

          <Box component="main" sx={{ flexGrow: 1, p: 3, mt: 8, minHeight: '100vh' }}>
            <ErrorBoundary>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/dns" element={<DnsManager />} />
                <Route path="/certs" element={<CertManager />} />
                <Route path="/ca" element={<CaSetup />} />
                <Route path="/proxy" element={<ProxyManager />} />
                <Route path="/integrations" element={<Integrations />} />
                <Route path="/settings" element={<Settings />} />
              </Routes>
            </ErrorBoundary>
          </Box>
        </Box>
      </BrowserRouter>
    </ThemeProvider>
  );
}

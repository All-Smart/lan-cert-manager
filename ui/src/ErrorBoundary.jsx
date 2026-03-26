import React from 'react';
import { Box, Typography, Button, Alert } from '@mui/material';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Box sx={{ p: 4, textAlign: 'center' }}>
          <Alert severity="error" sx={{ mb: 2 }}>
            Something went wrong: {this.state.error?.message || 'Unknown error'}
          </Alert>
          <Button variant="contained" onClick={() => {
            this.setState({ hasError: false, error: null });
            window.location.href = '/';
          }}>
            Reload
          </Button>
        </Box>
      );
    }
    return this.props.children;
  }
}

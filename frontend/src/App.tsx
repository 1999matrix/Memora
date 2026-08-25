import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { AuthGate, GuestGate, WorkspaceShell } from './components/shell'
import { AppProviders } from './lib/auth'
import { ThemeProvider } from './lib/theme'
import { AdminPage } from './pages/Admin'
import { LoginPage, RegisterPage } from './pages/Auth'
import { ChatPage } from './pages/Chat'
import { ConnectorsPage } from './pages/Connectors'
import { DocumentsPage } from './pages/Documents'
import { LandingPage } from './pages/Landing'
import { OrgSettingsPage, OrgWorkspacesPage, OrgsPage } from './pages/Orgs'
import { ProfilePage } from './pages/Profile'
import { SearchPage } from './pages/Search'
import { SummariesPage } from './pages/Summaries'
import { WorkspaceSettingsPage } from './pages/WorkspaceSettings'

export default function App() {
  return (
    <ThemeProvider>
      <AppProviders>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route
              path="/login"
              element={
                <GuestGate>
                  <LoginPage />
                </GuestGate>
              }
            />
            <Route
              path="/register"
              element={
                <GuestGate>
                  <RegisterPage />
                </GuestGate>
              }
            />
            <Route
              path="/orgs"
              element={
                <AuthGate>
                  <OrgsPage />
                </AuthGate>
              }
            />
            <Route
              path="/orgs/:orgId"
              element={
                <AuthGate>
                  <OrgWorkspacesPage />
                </AuthGate>
              }
            />
            <Route
              path="/orgs/:orgId/settings"
              element={
                <AuthGate>
                  <OrgSettingsPage />
                </AuthGate>
              }
            />
            <Route
              path="/profile"
              element={
                <AuthGate>
                  <ProfilePage />
                </AuthGate>
              }
            />
            <Route
              path="/admin"
              element={
                <AuthGate>
                  <AdminPage />
                </AuthGate>
              }
            />
            <Route
              path="/w/:workspaceId"
              element={
                <AuthGate>
                  <WorkspaceShell />
                </AuthGate>
              }
            >
              <Route index element={<Navigate to="chat" replace />} />
              <Route path="chat" element={<ChatPage />} />
              <Route path="chat/:conversationId" element={<ChatPage />} />
              <Route path="documents" element={<DocumentsPage />} />
              <Route path="connectors" element={<ConnectorsPage />} />
              <Route path="summaries" element={<SummariesPage />} />
              <Route path="search" element={<SearchPage />} />
              <Route path="settings" element={<WorkspaceSettingsPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AppProviders>
    </ThemeProvider>
  )
}

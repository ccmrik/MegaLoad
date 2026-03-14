import { Routes, Route } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { Dashboard } from "./pages/Dashboard";
import { Mods } from "./pages/Mods";
import { ConfigEditor } from "./pages/ConfigEditor";
import { Profiles } from "./pages/Profiles";
import { Settings } from "./pages/Settings";
import { LogViewer } from "./pages/LogViewer";

function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/mods" element={<Mods />} />
        <Route path="/config" element={<ConfigEditor />} />
        <Route path="/logs" element={<LogViewer />} />
        <Route path="/profiles" element={<Profiles />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}

export default App;

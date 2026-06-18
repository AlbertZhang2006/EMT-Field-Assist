import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { CallProvider } from './context/CallContext';
import HomeScreen from './screens/HomeScreen';
import ActiveCallScreen from './screens/ActiveCallScreen';
import CallReviewScreen from './screens/CallReviewScreen';
import CallLogScreen from './screens/CallLogScreen';
import CallDetailScreen from './screens/CallDetailScreen';
import SettingsScreen from './screens/SettingsScreen';
import ProtocolIngestionScreen from './screens/ProtocolIngestionScreen';
import ProtocolSearchScreen from './screens/ProtocolSearchScreen';
import ProtocolReviewScreen from './screens/ProtocolReviewScreen';
import PasteProtocolScreen from './screens/PasteProtocolScreen';
import ImportPDFScreen from './screens/ImportPDFScreen';
import AppLock from './components/AppLock';

export default function App() {
  return (
    <AppLock>
    <BrowserRouter>
      <CallProvider>
        <div className="h-full max-w-lg mx-auto bg-bg flex flex-col shadow-sm">
          <Routes>
            <Route path="/" element={<HomeScreen />} />
            <Route path="/call" element={<ActiveCallScreen />} />
            <Route path="/review" element={<CallReviewScreen />} />
            <Route path="/log" element={<CallLogScreen />} />
            <Route path="/log/:callId" element={<CallDetailScreen />} />
            <Route path="/settings" element={<SettingsScreen />} />
            <Route path="/protocols" element={<ProtocolIngestionScreen />} />
            <Route path="/protocol-search" element={<ProtocolSearchScreen />} />
            <Route path="/protocol-search/:resultId" element={<ProtocolReviewScreen />} />
            <Route path="/paste-protocol" element={<PasteProtocolScreen />} />
            <Route path="/import-pdf" element={<ImportPDFScreen />} />
          </Routes>
        </div>
      </CallProvider>
    </BrowserRouter>
    </AppLock>
  );
}

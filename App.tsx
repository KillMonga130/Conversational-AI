
import React from 'react';
import { EliteInterface } from './components/EliteInterface';

const App: React.FC = () => {
  return (
    <div className="w-screen h-screen bg-gradient-to-br from-blue-900 via-red-900 to-black text-white">
      <EliteInterface />
    </div>
  );
};

export default App;
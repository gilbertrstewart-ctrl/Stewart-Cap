import React, { createContext, useContext, useState } from "react";
import StockDetailModal from "@/components/StockDetailModal";
import AiAnalysisModal from "@/components/AiAnalysisModal";

const ModalContext = createContext(null);
export const useModals = () => useContext(ModalContext);

export function ModalProvider({ children }) {
  const [detailSymbol, setDetailSymbol] = useState(null);
  const [analysisSymbol, setAnalysisSymbol] = useState(null);

  return (
    <ModalContext.Provider
      value={{
        openStockDetail: (s) => setDetailSymbol(s),
        openAiAnalysis: (s) => setAnalysisSymbol(s),
      }}
    >
      {children}
      <StockDetailModal symbol={detailSymbol} onClose={() => setDetailSymbol(null)} />
      <AiAnalysisModal symbol={analysisSymbol} onClose={() => setAnalysisSymbol(null)} />
    </ModalContext.Provider>
  );
}

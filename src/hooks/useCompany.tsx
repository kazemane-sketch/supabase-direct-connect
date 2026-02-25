import { createContext, useContext, useState, ReactNode } from 'react';

interface Company {
  id: string;
  name: string;
  vat_number: string | null;
}

interface CompanyContextType {
  selectedCompany: Company | null;
  setSelectedCompany: (company: Company | null) => void;
  companies: Company[];
  setCompanies: (companies: Company[]) => void;
}

const CompanyContext = createContext<CompanyContextType | undefined>(undefined);

export function CompanyProvider({ children }: { children: ReactNode }) {
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);

  return (
    <CompanyContext.Provider value={{ selectedCompany, setSelectedCompany, companies, setCompanies }}>
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  const ctx = useContext(CompanyContext);
  if (!ctx) throw new Error('useCompany must be inside CompanyProvider');
  return ctx;
}

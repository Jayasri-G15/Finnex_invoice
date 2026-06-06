import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1',
});

export const fetchInvoices = async () => {
  const { data } = await api.get('/invoices/');
  return data;
};

export const fetchDashboardSummary = async () => {
  const { data } = await api.get('/invoices/summary');
  return data;
};

export const fetchLedgers = async () => {
  const { data } = await api.get('/invoices/ledgers');
  return data;
};

export const updateInvoice = async (id: string | number, payload: {
  status?: string;
  approval_status?: string;
  invoice_type?: string | null;
  notes?: string | null;
  ledger_code?: string | null;
  document_type?: string | null;
}) => {
  const { data } = await api.put(`/invoices/${id}`, payload);
  return data;
};

export const triggerSync = async () => {
  const { data } = await api.post('/invoices/sync');
  return data;
};

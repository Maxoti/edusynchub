// types/store.ts

export interface Paper {
  id: string;
  title: string;
  subject: string | null;
  price: number;
  curriculum: string | null;
  grade: string | null;
  examType: string | null;
  term: string | null;
  year: number | null;
  isBundle: boolean;
}

export interface StoreData {
  teacher: {
    name: string;
    businessName: string | null;
    whatsappNumber: string | null;
  };
  papers: Paper[];
}

export interface CompletedPurchase {
  purchaseId: string;
  downloadToken: string;
}
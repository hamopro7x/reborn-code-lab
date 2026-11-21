export type BybitAccountRow = {
  id: string;
  name: string;
  uid: string | null;
  sortOrder?: number;
  monthlyCashback?: number;
  frozen?: boolean;
  frozenUntil?: string | null;
};

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      User: {
        Row: {
          id: string;
          clerkId: string;
          name: string;
          email: string;
          imageUrl: string;
          credits: number;
          plan: string;
          createdAt: string;
          updatedAt: string;
        };
        Insert: {
          id?: string;
          clerkId: string;
          name: string;
          email: string;
          imageUrl?: string;
          credits?: number;
          plan?: string;
          createdAt?: string;
          updatedAt?: string;
        };
        Update: {
          id?: string;
          clerkId?: string;
          name?: string;
          email?: string;
          imageUrl?: string;
          credits?: number;
          plan?: string;
          createdAt?: string;
          updatedAt?: string;
        };
      };
      Workspace: {
        Row: {
          id: string;
          title: string | null;
          userId: string;
          messages: Json;
          fileData: Json | null;
          createdAt: string;
          updatedAt: string;
        };
        Insert: {
          id?: string;
          title?: string | null;
          userId: string;
          messages?: Json;
          fileData?: Json | null;
          createdAt?: string;
          updatedAt?: string;
        };
        Update: {
          id?: string;
          title?: string | null;
          userId?: string;
          messages?: Json;
          fileData?: Json | null;
          createdAt?: string;
          updatedAt?: string;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
  };
}

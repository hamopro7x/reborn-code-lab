export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          kind: string
          meta: Json
          read_at: string | null
          title: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          kind: string
          meta?: Json
          read_at?: string | null
          title: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          meta?: Json
          read_at?: string | null
          title?: string
        }
        Relationships: []
      }
      agent_devices: {
        Row: {
          app_version: string | null
          approved: boolean
          created_at: string
          device_id: string
          device_label: string | null
          employee_name: string | null
          id: string
          last_seen_at: string | null
          os: string | null
          secret_hash: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          app_version?: string | null
          approved?: boolean
          created_at?: string
          device_id: string
          device_label?: string | null
          employee_name?: string | null
          id?: string
          last_seen_at?: string | null
          os?: string | null
          secret_hash: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          app_version?: string | null
          approved?: boolean
          created_at?: string
          device_id?: string
          device_label?: string | null
          employee_name?: string | null
          id?: string
          last_seen_at?: string | null
          os?: string | null
          secret_hash?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      agent_enroll_codes: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          employee_name: string | null
          note: string | null
          target_user_id: string | null
          used_at: string | null
          used_by_device: string | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          employee_name?: string | null
          note?: string | null
          target_user_id?: string | null
          used_at?: string | null
          used_by_device?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          employee_name?: string | null
          note?: string | null
          target_user_id?: string | null
          used_at?: string | null
          used_by_device?: string | null
        }
        Relationships: []
      }
      agent_pairings: {
        Row: {
          code: string
          created_at: string
          device_id: string
          device_label: string | null
          employee_name: string | null
          last_seen_at: string
          os: string | null
          secret_hash: string
        }
        Insert: {
          code: string
          created_at?: string
          device_id: string
          device_label?: string | null
          employee_name?: string | null
          last_seen_at?: string
          os?: string | null
          secret_hash: string
        }
        Update: {
          code?: string
          created_at?: string
          device_id?: string
          device_label?: string | null
          employee_name?: string | null
          last_seen_at?: string
          os?: string | null
          secret_hash?: string
        }
        Relationships: []
      }
      api_keys: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          revoked_at: string | null
          scopes: string[]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name: string
          revoked_at?: string | null
          scopes?: string[]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          revoked_at?: string | null
          scopes?: string[]
        }
        Relationships: []
      }
      bybit_account_info: {
        Row: {
          account_id: string | null
          bonus: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          mfa_code: string | null
          password: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          bonus?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          mfa_code?: string | null
          password?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          bonus?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          mfa_code?: string | null
          password?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bybit_account_info_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "bybit_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      bybit_accounts: {
        Row: {
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          monthly_cashback: number
          name: string
          sort_order: number
          uid: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          monthly_cashback?: number
          name?: string
          sort_order?: number
          uid?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          monthly_cashback?: number
          name?: string
          sort_order?: number
          uid?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      bybit_card_txns: {
        Row: {
          account_id: string | null
          amount: number | null
          created_at: string
          currency: string | null
          detail: Json
          merchant: string | null
          pan4: string | null
          status: string | null
          txn_id: string
          txn_time: number
          txn_type: string | null
        }
        Insert: {
          account_id?: string | null
          amount?: number | null
          created_at?: string
          currency?: string | null
          detail?: Json
          merchant?: string | null
          pan4?: string | null
          status?: string | null
          txn_id: string
          txn_time?: number
          txn_type?: string | null
        }
        Update: {
          account_id?: string | null
          amount?: number | null
          created_at?: string
          currency?: string | null
          detail?: Json
          merchant?: string | null
          pan4?: string | null
          status?: string | null
          txn_id?: string
          txn_time?: number
          txn_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bybit_card_txns_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "bybit_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      bybit_cards: {
        Row: {
          account_id: string | null
          brand: string
          created_at: string
          created_by: string
          currency: string
          cvv: string | null
          expiry: string | null
          full_number: string | null
          id: string
          name: string | null
          pan4: string
          status: string
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          brand?: string
          created_at?: string
          created_by: string
          currency?: string
          cvv?: string | null
          expiry?: string | null
          full_number?: string | null
          id?: string
          name?: string | null
          pan4: string
          status?: string
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          brand?: string
          created_at?: string
          created_by?: string
          currency?: string
          cvv?: string | null
          expiry?: string | null
          full_number?: string | null
          id?: string
          name?: string | null
          pan4?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bybit_cards_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "bybit_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      bybit_ledger: {
        Row: {
          account_id: string | null
          amount: number
          created_at: string
          currency: string
          detail: Json
          direction: string
          fee: number
          id: string
          kind: string
          occurred_at: string
          ref_id: string
          status: string
          title: string
        }
        Insert: {
          account_id?: string | null
          amount?: number
          created_at?: string
          currency?: string
          detail?: Json
          direction?: string
          fee?: number
          id?: string
          kind: string
          occurred_at?: string
          ref_id: string
          status?: string
          title?: string
        }
        Update: {
          account_id?: string | null
          amount?: number
          created_at?: string
          currency?: string
          detail?: Json
          direction?: string
          fee?: number
          id?: string
          kind?: string
          occurred_at?: string
          ref_id?: string
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "bybit_ledger_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "bybit_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      bybit_sync_state: {
        Row: {
          id: string
          last_result: Json
          last_run_at: string | null
          lease_until: string | null
          paused: boolean
        }
        Insert: {
          id: string
          last_result?: Json
          last_run_at?: string | null
          lease_until?: string | null
          paused?: boolean
        }
        Update: {
          id?: string
          last_result?: Json
          last_run_at?: string | null
          lease_until?: string | null
          paused?: boolean
        }
        Relationships: []
      }
      card_transactions: {
        Row: {
          amount: number
          card_last4: string | null
          created_at: string
          currency_code: string
          external_id: string | null
          id: string
          merchant: string
          notes: string | null
          occurred_at: string
          raw: Json
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          card_last4?: string | null
          created_at?: string
          currency_code?: string
          external_id?: string | null
          id?: string
          merchant: string
          notes?: string | null
          occurred_at?: string
          raw?: Json
          source?: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          card_last4?: string | null
          created_at?: string
          currency_code?: string
          external_id?: string | null
          id?: string
          merchant?: string
          notes?: string | null
          occurred_at?: string
          raw?: Json
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          active: boolean
          banner_image: string | null
          created_at: string
          description: string | null
          icon: string | null
          id: string
          name: string
          parent_id: string | null
          slug: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          banner_image?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          name: string
          parent_id?: string | null
          slug: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          banner_image?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          name?: string
          parent_id?: string | null
          slug?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      countdown_timers: {
        Row: {
          active: boolean
          created_at: string
          ends_at: string
          id: string
          subtitle: string | null
          title: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          ends_at: string
          id?: string
          subtitle?: string | null
          title: string
        }
        Update: {
          active?: boolean
          created_at?: string
          ends_at?: string
          id?: string
          subtitle?: string | null
          title?: string
        }
        Relationships: []
      }
      countries: {
        Row: {
          active: boolean
          code: string
          currency_code: string
          dial_code: string
          flag: string | null
          name_ar: string
          name_en: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          code: string
          currency_code: string
          dial_code: string
          flag?: string | null
          name_ar: string
          name_en: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          code?: string
          currency_code?: string
          dial_code?: string
          flag?: string | null
          name_ar?: string
          name_en?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "countries_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      course_access: {
        Row: {
          course_id: string
          created_at: string
          granted_by: string | null
          id: string
          user_id: string
        }
        Insert: {
          course_id: string
          created_at?: string
          granted_by?: string | null
          id?: string
          user_id: string
        }
        Update: {
          course_id?: string
          created_at?: string
          granted_by?: string | null
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_access_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      course_lessons: {
        Row: {
          course_id: string
          created_at: string
          description: string | null
          duration_sec: number | null
          id: string
          sort_order: number
          title: string
          updated_at: string
          video_path: string
        }
        Insert: {
          course_id: string
          created_at?: string
          description?: string | null
          duration_sec?: number | null
          id?: string
          sort_order?: number
          title: string
          updated_at?: string
          video_path: string
        }
        Update: {
          course_id?: string
          created_at?: string
          description?: string | null
          duration_sec?: number | null
          id?: string
          sort_order?: number
          title?: string
          updated_at?: string
          video_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_lessons_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      course_progress: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          lesson_id: string
          updated_at: string
          user_id: string
          watched_seconds: number
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          lesson_id: string
          updated_at?: string
          user_id: string
          watched_seconds?: number
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          lesson_id?: string
          updated_at?: string
          user_id?: string
          watched_seconds?: number
        }
        Relationships: [
          {
            foreignKeyName: "course_progress_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "course_lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          cover_url: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_published: boolean
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_published?: boolean
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_published?: boolean
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      currencies: {
        Row: {
          active: boolean
          code: string
          name: string
          sort_order: number
          symbol: string
        }
        Insert: {
          active?: boolean
          code: string
          name: string
          sort_order?: number
          symbol: string
        }
        Update: {
          active?: boolean
          code?: string
          name?: string
          sort_order?: number
          symbol?: string
        }
        Relationships: []
      }
      employee_face_enroll: {
        Row: {
          created_at: string
          created_by: string | null
          image_path: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          image_path: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          image_path?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      exchange_rates: {
        Row: {
          currency_code: string
          rate_from_egp: number
          updated_at: string
        }
        Insert: {
          currency_code: string
          rate_from_egp: number
          updated_at?: string
        }
        Update: {
          currency_code?: string
          rate_from_egp?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exchange_rates_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: true
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      hero_banners: {
        Row: {
          active: boolean
          background_color: string | null
          badges: Json
          button_size: number
          buttons: Json
          buttons_position: string
          content_position_x: string
          content_position_y: string
          created_at: string
          gap_subtitle_buttons: number
          gap_title_subtitle: number
          id: string
          media_fit: string
          media_path: string | null
          media_type: string
          media_url: string | null
          overlay_color: string
          overlay_enabled: boolean
          overlay_opacity: number
          positions: Json
          poster_path: string | null
          poster_url: string | null
          show_subtitle: boolean
          show_subtitle2: boolean
          show_title: boolean
          sort_order: number
          subtitle: string
          subtitle_size: number
          subtitle_size_mobile: number
          subtitle2: string
          subtitle2_size: number
          subtitle2_size_mobile: number
          text_align: string
          title: string
          title_size: number
          title_size_mobile: number
          updated_at: string
          video_autoplay: boolean
          video_loop: boolean
          video_muted: boolean
        }
        Insert: {
          active?: boolean
          background_color?: string | null
          badges?: Json
          button_size?: number
          buttons?: Json
          buttons_position?: string
          content_position_x?: string
          content_position_y?: string
          created_at?: string
          gap_subtitle_buttons?: number
          gap_title_subtitle?: number
          id?: string
          media_fit?: string
          media_path?: string | null
          media_type?: string
          media_url?: string | null
          overlay_color?: string
          overlay_enabled?: boolean
          overlay_opacity?: number
          positions?: Json
          poster_path?: string | null
          poster_url?: string | null
          show_subtitle?: boolean
          show_subtitle2?: boolean
          show_title?: boolean
          sort_order?: number
          subtitle?: string
          subtitle_size?: number
          subtitle_size_mobile?: number
          subtitle2?: string
          subtitle2_size?: number
          subtitle2_size_mobile?: number
          text_align?: string
          title?: string
          title_size?: number
          title_size_mobile?: number
          updated_at?: string
          video_autoplay?: boolean
          video_loop?: boolean
          video_muted?: boolean
        }
        Update: {
          active?: boolean
          background_color?: string | null
          badges?: Json
          button_size?: number
          buttons?: Json
          buttons_position?: string
          content_position_x?: string
          content_position_y?: string
          created_at?: string
          gap_subtitle_buttons?: number
          gap_title_subtitle?: number
          id?: string
          media_fit?: string
          media_path?: string | null
          media_type?: string
          media_url?: string | null
          overlay_color?: string
          overlay_enabled?: boolean
          overlay_opacity?: number
          positions?: Json
          poster_path?: string | null
          poster_url?: string | null
          show_subtitle?: boolean
          show_subtitle2?: boolean
          show_title?: boolean
          sort_order?: number
          subtitle?: string
          subtitle_size?: number
          subtitle_size_mobile?: number
          subtitle2?: string
          subtitle2_size?: number
          subtitle2_size_mobile?: number
          text_align?: string
          title?: string
          title_size?: number
          title_size_mobile?: number
          updated_at?: string
          video_autoplay?: boolean
          video_loop?: boolean
          video_muted?: boolean
        }
        Relationships: []
      }
      order_items: {
        Row: {
          id: string
          order_id: string
          product_id: string | null
          product_name: string
          quantity: number
          unit_price: number
          warranty_days: number
        }
        Insert: {
          id?: string
          order_id: string
          product_id?: string | null
          product_name: string
          quantity?: number
          unit_price: number
          warranty_days?: number
        }
        Update: {
          id?: string
          order_id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          unit_price?: number
          warranty_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          admin_notes: string | null
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          currency_code: string
          customer_country: string
          customer_email: string
          customer_name: string
          customer_phone: string
          device_id: string | null
          dial_code: string
          discount_amount: number
          id: string
          order_code: string
          payment_method_id: string | null
          payment_screenshot: string | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          total: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          admin_notes?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          currency_code: string
          customer_country: string
          customer_email: string
          customer_name: string
          customer_phone: string
          device_id?: string | null
          dial_code: string
          discount_amount?: number
          id?: string
          order_code: string
          payment_method_id?: string | null
          payment_screenshot?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal: number
          total: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          admin_notes?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          currency_code?: string
          customer_country?: string
          customer_email?: string
          customer_name?: string
          customer_phone?: string
          device_id?: string | null
          dial_code?: string
          discount_amount?: number
          id?: string
          order_code?: string
          payment_method_id?: string | null
          payment_screenshot?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          total?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "orders_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_methods: {
        Row: {
          account_name: string | null
          account_number: string
          active: boolean
          country_code: string | null
          created_at: string
          icon: string | null
          id: string
          instructions: string | null
          name: string
          sort_order: number
          type: string
        }
        Insert: {
          account_name?: string | null
          account_number: string
          active?: boolean
          country_code?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          instructions?: string | null
          name: string
          sort_order?: number
          type: string
        }
        Update: {
          account_name?: string | null
          account_number?: string
          active?: boolean
          country_code?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          instructions?: string | null
          name?: string
          sort_order?: number
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_methods_country_code_fkey"
            columns: ["country_code"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["code"]
          },
        ]
      }
      product_prices: {
        Row: {
          currency_code: string
          id: string
          price: number
          product_id: string
        }
        Insert: {
          currency_code: string
          id?: string
          price: number
          product_id: string
        }
        Update: {
          currency_code?: string
          id?: string
          price?: number
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_prices_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "product_prices_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          base_price_egp: number
          category_id: string | null
          created_at: string
          description: string | null
          discount_ends_at: string | null
          discount_percent: number
          featured: boolean
          gallery: string[]
          id: string
          main_image: string | null
          name: string
          refund_text: string | null
          short_description: string | null
          slug: string
          sort_order: number
          updated_at: string
          upsell_ids: string[]
          warranty_days: number
          warranty_text: string | null
        }
        Insert: {
          active?: boolean
          base_price_egp?: number
          category_id?: string | null
          created_at?: string
          description?: string | null
          discount_ends_at?: string | null
          discount_percent?: number
          featured?: boolean
          gallery?: string[]
          id?: string
          main_image?: string | null
          name: string
          refund_text?: string | null
          short_description?: string | null
          slug: string
          sort_order?: number
          updated_at?: string
          upsell_ids?: string[]
          warranty_days?: number
          warranty_text?: string | null
        }
        Update: {
          active?: boolean
          base_price_egp?: number
          category_id?: string | null
          created_at?: string
          description?: string | null
          discount_ends_at?: string | null
          discount_percent?: number
          featured?: boolean
          gallery?: string[]
          id?: string
          main_image?: string | null
          name?: string
          refund_text?: string | null
          short_description?: string | null
          slug?: string
          sort_order?: number
          updated_at?: string
          upsell_ids?: string[]
          warranty_days?: number
          warranty_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          country_code: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
        }
        Insert: {
          avatar_url?: string | null
          country_code?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
        }
        Update: {
          avatar_url?: string | null
          country_code?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
        }
        Relationships: []
      }
      remote_access: {
        Row: {
          access_code: string | null
          created_at: string
          device_label: string | null
          employee_id: string | null
          employee_name: string
          id: string
          is_active: boolean
          last_connected_at: string | null
          notes: string | null
          remote_url: string
          updated_at: string
        }
        Insert: {
          access_code?: string | null
          created_at?: string
          device_label?: string | null
          employee_id?: string | null
          employee_name: string
          id?: string
          is_active?: boolean
          last_connected_at?: string | null
          notes?: string | null
          remote_url: string
          updated_at?: string
        }
        Update: {
          access_code?: string | null
          created_at?: string
          device_label?: string | null
          employee_id?: string | null
          employee_name?: string
          id?: string
          is_active?: boolean
          last_connected_at?: string | null
          notes?: string | null
          remote_url?: string
          updated_at?: string
        }
        Relationships: []
      }
      reviews: {
        Row: {
          approved: boolean
          comment: string | null
          created_at: string
          customer_name: string
          id: string
          product_id: string
          rating: number
          user_id: string | null
        }
        Insert: {
          approved?: boolean
          comment?: string | null
          created_at?: string
          customer_name: string
          id?: string
          product_id: string
          rating: number
          user_id?: string | null
        }
        Update: {
          approved?: boolean
          comment?: string | null
          created_at?: string
          customer_name?: string
          id?: string
          product_id?: string
          rating?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      screenshare_signals: {
        Row: {
          created_at: string
          device_id: string
          expires_at: string
          id: string
          payload: Json
          sender: string
          viewer_id: string
        }
        Insert: {
          created_at?: string
          device_id: string
          expires_at?: string
          id?: string
          payload: Json
          sender: string
          viewer_id: string
        }
        Update: {
          created_at?: string
          device_id?: string
          expires_at?: string
          id?: string
          payload?: Json
          sender?: string
          viewer_id?: string
        }
        Relationships: []
      }
      site_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      user_devices: {
        Row: {
          device_fingerprint: string
          device_label: string | null
          first_seen_at: string
          hw_signature: string | null
          id: string
          ip: string | null
          last_seen_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          device_fingerprint: string
          device_label?: string | null
          first_seen_at?: string
          hw_signature?: string | null
          id?: string
          ip?: string | null
          last_seen_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          device_fingerprint?: string
          device_label?: string | null
          first_seen_at?: string
          hw_signature?: string | null
          id?: string
          ip?: string | null
          last_seen_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          permissions: Json
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          permissions?: Json
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          permissions?: Json
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      webauthn_credentials: {
        Row: {
          created_at: string
          credential_id: string
          id: string
          label: string | null
          last_used_at: string | null
          public_key: string
          user_id: string
        }
        Insert: {
          created_at?: string
          credential_id: string
          id?: string
          label?: string | null
          last_used_at?: string | null
          public_key: string
          user_id: string
        }
        Update: {
          created_at?: string
          credential_id?: string
          id?: string
          label?: string | null
          last_used_at?: string | null
          public_key?: string
          user_id?: string
        }
        Relationships: []
      }
      work_auth_challenges: {
        Row: {
          challenge: string
          created_at: string
          expires_at: string
          id: string
          purpose: string
          user_id: string
        }
        Insert: {
          challenge: string
          created_at?: string
          expires_at: string
          id?: string
          purpose: string
          user_id: string
        }
        Update: {
          challenge?: string
          created_at?: string
          expires_at?: string
          id?: string
          purpose?: string
          user_id?: string
        }
        Relationships: []
      }
      work_manual_card_txns: {
        Row: {
          amount: number | null
          created_at: string
          egp: number | null
          id: string
          merchant: string
          pan4: string | null
          quantity: number | null
          shift_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number | null
          created_at?: string
          egp?: number | null
          id?: string
          merchant?: string
          pan4?: string | null
          quantity?: number | null
          shift_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number | null
          created_at?: string
          egp?: number | null
          id?: string
          merchant?: string
          pan4?: string | null
          quantity?: number | null
          shift_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_manual_card_txns_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "work_shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      work_manual_txns: {
        Row: {
          amount: number | null
          amount_saved_at: string | null
          card: string
          created_at: string
          details: string | null
          details_saved_at: string | null
          id: string
          shift_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number | null
          amount_saved_at?: string | null
          card: string
          created_at?: string
          details?: string | null
          details_saved_at?: string | null
          id?: string
          shift_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number | null
          amount_saved_at?: string | null
          card?: string
          created_at?: string
          details?: string | null
          details_saved_at?: string | null
          id?: string
          shift_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_manual_txns_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "work_shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      work_shifts: {
        Row: {
          created_at: string
          ended_at: string | null
          ended_reason: string | null
          id: string
          started_at: string
          user_id: string
          verified_device: boolean
          verified_face: boolean
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          ended_reason?: string | null
          id?: string
          started_at?: string
          user_id: string
          verified_device?: boolean
          verified_face?: boolean
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          ended_reason?: string | null
          id?: string
          started_at?: string
          user_id?: string
          verified_device?: boolean
          verified_face?: boolean
        }
        Relationships: []
      }
      work_transfer_notes: {
        Row: {
          created_at: string
          ledger_id: string
          note: string
          saved_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          ledger_id: string
          note: string
          saved_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          ledger_id?: string
          note?: string
          saved_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_transfer_notes_ledger_id_fkey"
            columns: ["ledger_id"]
            isOneToOne: true
            referencedRelation: "bybit_ledger"
            referencedColumns: ["id"]
          },
        ]
      }
      work_txn_assignments: {
        Row: {
          assign_mode: string
          assigned_at: string
          assigned_by: string | null
          id: string
          kind: string
          ledger_id: string
          occurred_at: string
          shift_id: string | null
          user_id: string
        }
        Insert: {
          assign_mode?: string
          assigned_at?: string
          assigned_by?: string | null
          id?: string
          kind: string
          ledger_id: string
          occurred_at: string
          shift_id?: string | null
          user_id: string
        }
        Update: {
          assign_mode?: string
          assigned_at?: string
          assigned_by?: string | null
          id?: string
          kind?: string
          ledger_id?: string
          occurred_at?: string
          shift_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_txn_assignments_ledger_id_fkey"
            columns: ["ledger_id"]
            isOneToOne: true
            referencedRelation: "bybit_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_txn_assignments_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "work_shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      work_txn_entries: {
        Row: {
          created_at: string
          egp: number | null
          egp_at: string | null
          ledger_id: string
          quantity: number | null
          quantity_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          egp?: number | null
          egp_at?: string | null
          ledger_id: string
          quantity?: number | null
          quantity_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          egp?: number | null
          egp_at?: string | null
          ledger_id?: string
          quantity?: number | null
          quantity_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_txn_entries_ledger_id_fkey"
            columns: ["ledger_id"]
            isOneToOne: true
            referencedRelation: "bybit_ledger"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_allow_signup: { Args: { p_email: string }; Returns: boolean }
      agent_claim_pairing: { Args: { p_code: string }; Returns: Json }
      agent_create_enroll_code:
        | {
            Args: { p_employee_name?: string; p_note?: string }
            Returns: string
          }
        | {
            Args: {
              p_employee_name?: string
              p_note?: string
              p_user_id?: string
            }
            Returns: string
          }
      agent_exchange_signals: {
        Args: { p_device_id: string; p_outgoing?: Json; p_secret: string }
        Returns: Json
      }
      agent_heartbeat: {
        Args: { p_device_id: string; p_secret: string; p_version?: string }
        Returns: boolean
      }
      agent_pair_request: {
        Args: {
          p_device_id: string
          p_device_label: string
          p_employee_name: string
          p_os: string
          p_secret: string
        }
        Returns: string
      }
      agent_register: {
        Args: {
          p_device_id: string
          p_device_label?: string
          p_employee_name?: string
          p_enroll_code?: string
          p_os?: string
          p_secret: string
          p_version?: string
        }
        Returns: boolean
      }
      bybit_account_get_keys: {
        Args: { p_account_id: string }
        Returns: {
          api_key: string
          api_secret: string
        }[]
      }
      bybit_account_set_keys: {
        Args: {
          p_account_id: string
          p_by: string
          p_key: string
          p_secret: string
        }
        Returns: boolean
      }
      gen_order_code: { Args: never; Returns: string }
      integration_clear_bybit: { Args: never; Returns: boolean }
      integration_clear_redotpay: { Args: never; Returns: boolean }
      integration_get_bybit: {
        Args: never
        Returns: {
          api_key: string
          api_secret: string
        }[]
      }
      integration_get_redotpay: {
        Args: never
        Returns: {
          api_key: string
          api_secret: string
        }[]
      }
      integration_set_bybit: {
        Args: { p_by: string; p_key: string; p_secret: string }
        Returns: boolean
      }
      integration_set_redotpay: {
        Args: { p_by: string; p_key: string; p_secret: string }
        Returns: boolean
      }
      prune_bybit_card_txns: {
        Args: { p_delete?: number; p_max?: number }
        Returns: number
      }
      work_assign_txn: {
        Args: { p_ledger_id: string; p_shift_id: string }
        Returns: Json
      }
      work_claim_shift: {
        Args: { p_device: boolean; p_face: boolean }
        Returns: Json
      }
    }
    Enums: {
      app_role: "admin" | "employee" | "customer"
      order_status:
        | "pending_payment"
        | "awaiting_confirmation"
        | "confirmed"
        | "rejected"
        | "completed"
        | "cancelled"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "employee", "customer"],
      order_status: [
        "pending_payment",
        "awaiting_confirmation",
        "confirmed",
        "rejected",
        "completed",
        "cancelled",
      ],
    },
  },
} as const

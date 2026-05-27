import { create } from "zustand";
import { devtools, persist, createJSONStorage } from "zustand/middleware";
import Logger from "../utils/logger";
import { STORAGE_KEYS } from "../constants";

const logger = new Logger("Store");

export const useAuthStore = create(
  devtools(
    persist(
      (set, get) => ({
        user: null,
        token: localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN) || null,
        tokenExpiration: null,
        isLoading: false,
        error: null,

        setUser: (userOrUpdater) => {
          const currentUser = get().user;
          const nextUser =
            typeof userOrUpdater === "function"
              ? userOrUpdater(currentUser)
              : userOrUpdater;
          set({ user: nextUser });
          logger.debug("User set", {
            userId: nextUser?.id,
            role: nextUser?.tipo_usuario || nextUser?.role,
          });
        },

        setToken: (token, expirationTime = 3600) => {
          if (!token) {
            set({ token: null, tokenExpiration: null });
            localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
            return;
          }

          const expirationDate = new Date(Date.now() + expirationTime * 1000);
          set({ token, tokenExpiration: expirationDate.getTime() });
          localStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, token);
          localStorage.setItem("token_expiration", expirationDate.getTime());
          logger.debug("Token set", {
            expiresAt: expirationDate.toISOString(),
          });
        },

        setLoading: (isLoading) => set({ isLoading }),

        setError: (error) => set({ error }),

        isTokenExpired: () => {
          const expirationTime = get().tokenExpiration;
          if (!expirationTime) return false;
          return Date.now() > expirationTime;
        },

        logout: () => {
          set({ user: null, token: null, tokenExpiration: null, error: null });
          localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
          localStorage.removeItem(STORAGE_KEYS.USER);
          localStorage.removeItem("token_expiration");
          logger.info("User logged out");
        },

        isAuthenticated: () => {
          const token = get().token;
          const isExpired = get().isTokenExpired();

          if (!token || isExpired) {
            if (isExpired) {
              logger.warn("Token expired, logging out");
              get().logout();
            }
            return false;
          }

          return true;
        },
      }),
      {
        name: STORAGE_KEYS.USER,
        partialize: (state) => ({
          token: state.token,
          user: state.user,
          tokenExpiration: state.tokenExpiration,
        }),
      },
    ),
  ),
);

/** Deve ficar antes do carrinho: `clearCart` chama `clearPrescricoes`. */
export const usePrescriptionStore = create(
  devtools(
    persist(
      (set, get) => ({
        prescricoesPendentes: {},
        prescricoesPorFarmacia: {},

        setPrescricao: (productId, dadosReceita) => {
          set((state) => ({
            prescricoesPendentes: {
              ...state.prescricoesPendentes,
              [productId]: dadosReceita,
            },
          }));
        },

        setPrescricaoFarmacia: (pharmacyId, dadosReceita) => {
          set((state) => ({
            prescricoesPorFarmacia: {
              ...state.prescricoesPorFarmacia,
              [pharmacyId]: dadosReceita,
            },
          }));
        },

        atualizarStatusPorId: (prescriptionId, novosDados) => {
          set((state) => {
            const novosPendentes = { ...state.prescricoesPendentes };
            for (const [pid, rec] of Object.entries(novosPendentes)) {
              if (rec?._id === prescriptionId) {
                novosPendentes[pid] = { ...rec, ...novosDados };
              }
            }
            const novosPorFarmacia = { ...state.prescricoesPorFarmacia };
            for (const [fid, rec] of Object.entries(novosPorFarmacia)) {
              if (rec?._id === prescriptionId) {
                novosPorFarmacia[fid] = { ...rec, ...novosDados };
              }
            }
            return {
              prescricoesPendentes: novosPendentes,
              prescricoesPorFarmacia: novosPorFarmacia,
            };
          });
        },

        getPrescricao: (productId) => {
          return get().prescricoesPendentes[productId] || null;
        },

        getPrescricaoFarmacia: (pharmacyId) => {
          return get().prescricoesPorFarmacia[pharmacyId] || null;
        },

        clearPrescricoes: () =>
          set({ prescricoesPendentes: {}, prescricoesPorFarmacia: {} }),
      }),
      {
        name: "ssm_prescricoes_v1",
        storage: createJSONStorage(() => sessionStorage),
      },
    ),
  ),
);

export const useCartStore = create(
  devtools(
    persist(
      (set, get) => ({
        items: [],

        addItem: (product) => {
          if (!useAuthStore.getState().isAuthenticated()) {
            logger.warn("Tentativa de adicionar item sem autenticação", {
              productId: product?.id,
            });
            return { authRequired: true };
          }

          const state = get();
          const currentPharmacyId = state.items[0]?.id_farmacia;

          if (
            currentPharmacyId &&
            product.id_farmacia &&
            String(currentPharmacyId) !== String(product.id_farmacia)
          ) {
            logger.warn("Tentativa de adicionar item de outra farmácia", {
              currentPharmacy: currentPharmacyId,
              newPharmacy: product.id_farmacia,
            });
            return {
              pharmacyConflict: true,
              currentPharmacyName: state.items[0]?.nome_farmacia,
            };
          }

          set((state) => {
            const existing = state.items.find((item) => item.id === product.id);

            if (existing) {
              return {
                items: state.items.map((item) =>
                  item.id === product.id
                    ? {
                        ...item,
                        quantity: item.quantity + (product.quantity || 1),
                      }
                    : item,
                ),
              };
            }

            return {
              items: [
                ...state.items,
                { ...product, quantity: product.quantity || 1 },
              ],
            };
          });

          logger.debug("Item added to cart", { productId: product.id });
          return { pharmacyConflict: false };
        },

        replaceCartWithItem: (product) => {
          if (!useAuthStore.getState().isAuthenticated()) {
            logger.warn("Tentativa de substituir carrinho sem autenticação", {
              productId: product?.id,
            });
            return { authRequired: true };
          }

          set({ items: [{ ...product, quantity: product.quantity || 1 }] });
          logger.info("Cart replaced with item from new pharmacy", {
            productId: product.id,
          });
          return { authRequired: false };
        },

        removeItem: (productId) => {
          set((state) => ({
            items: state.items.filter((item) => item.id !== productId),
          }));

          logger.debug("Item removed from cart", { productId });
        },

        updateQuantity: (productId, quantity) => {
          if (quantity <= 0) {
            get().removeItem(productId);
            return;
          }

          set((state) => ({
            items: state.items.map((item) =>
              item.id === productId ? { ...item, quantity } : item,
            ),
          }));

          logger.debug("Item quantity updated", { productId, quantity });
        },

        clearCart: () => {
          set({ items: [] });
          usePrescriptionStore.getState().clearPrescricoes();
          logger.info("Cart cleared");
        },

        getTotal: () => {
          return get().items.reduce(
            (total, item) => total + item.preco * item.quantity,
            0,
          );
        },

        getItemCount: () => {
          return get().items.reduce((count, item) => count + item.quantity, 0);
        },
      }),
      {
        name: STORAGE_KEYS.CART,
      },
    ),
  ),
);

export const useUiStore = create(
  devtools((set) => ({
    isMobileMenuOpen: false,
    notifications: [],

    toggleMobileMenu: () =>
      set((state) => ({ isMobileMenuOpen: !state.isMobileMenuOpen })),

    closeMobileMenu: () => set({ isMobileMenuOpen: false }),

    addNotification: (notification) => {
      const id = Date.now() + Math.floor(Math.random() * 1000);
      const duracao = notification.duration ?? 5000;
      set((state) => ({
        notifications: [...state.notifications, { ...notification, id }],
      }));

      setTimeout(() => {
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id),
        }));
      }, duracao);

      return id;
    },

    removeNotification: (id) => {
      set((state) => ({
        notifications: state.notifications.filter((n) => n.id !== id),
      }));
    },
  })),
);

export const useFavoritesStore = create(
  devtools(
    persist(
      (set, get) => ({
        items: [],

        toggleFavorite: (product) => {
          if (!useAuthStore.getState().isAuthenticated()) {
            logger.warn("Tentativa de favoritar sem autenticação", {
              productId: product?.id,
            });
            return { authRequired: true };
          }

          set((state) => {
            const exists = state.items.find((i) => i.id === product.id);
            if (exists) {
              return { items: state.items.filter((i) => i.id !== product.id) };
            }
            return {
              items: [
                ...state.items,
                {
                  id: product.id,
                  nome: product.nome,
                  preco: product.preco,
                  imagem_url: product.imagem_url,
                  id_farmacia: product.id_farmacia,
                },
              ],
            };
          });
          return { authRequired: false };
        },

        isFavorite: (productId) => {
          return get().items.some((i) => i.id === productId);
        },

        clearFavorites: () => set({ items: [] }),
        setFavorites: (items) => set({ items: Array.isArray(items) ? items : [] }),
      }),
      {
        name: STORAGE_KEYS.FAVORITES,
      },
    ),
  ),
);

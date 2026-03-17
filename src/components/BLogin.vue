<template>
    <Button icon="material-symbols-light:login" flat iconSize="1.4rem" @click="login" v-if="!useUser.isLoggedIn" />
    <div class="container-login" ref="dropdown" v-else>
        <Button icon="mdi:user" iconSize="1.4rem" bound flat @click="show = !show" />

        <div v-if="show" class="dialog column">
            <div class="dialog-top column">
                <h2>{{ user.name }}</h2>
                <span class="text-secondary email">{{ user.email }}</span>
            </div>

            <div class="divider"></div>

            <div class="dialog-main">
                <a @click="account" class="account row items-center ga-sm">
                    🛠️ Manage Account
                </a>
            </div>

            <div class="divider"></div>

            <div class="dialog-footer">
                <a @click="logout" class="signup row items-center ga-sm">
                    👋 Log out
                </a>
            </div>
        </div>
    </div>
</template>

<script>
import Authentification from '../utils/authentification';
import useUserStore from '../stores/useUser'
import Button from './UI/Button.vue';
import Token from '../utils/token';
export default {
    data() {
        return {
            show: false,
            useUser: useUserStore(),
            user: {},
        }
    },

    components: {
        Button
    },

    beforeMount() {
        chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
            if (message.type === 'LOGIN_SUCCESS') {
                const tokenService = new Token()
                const token = await tokenService.getDecryptedToken()
                if (token) {
                    this.useUser.setLoggedIn()
                    this.loadUser()
                }
            }
        });
    },

    created() {
        if (this.useUser.isLoggedIn) {
            this.loadUser();
        }
    },

    methods: {
        login() {
            const auth = new Authentification();
            auth.signIn()
        },

        loadUser() {
            chrome.runtime.sendMessage({ type: 'loadUser' }, (response) => {
                if (response?.success) {
                    this.user = response.data;
                } else {
                    console.error('Error al obtener servidores:', response?.error);
                }
            });
        },

        account() {
            chrome.tabs.create({ url: `${import.meta.env.VITE_PASSPORT_SERVER}` }, function () {
                window.close();
            });
        },

        logout() {
            const authentification = new Authentification();
            authentification.logout();
            this.useUser.isLoggedIn = false;
            this.show = false;
        },

        handleClickOutside(event) {
            const dropdown = this.$refs.dropdown;
            if (dropdown && !dropdown.contains(event.target)) {
                this.show = false;
            }
        },
    },

    mounted() {
        document.addEventListener('click', this.handleClickOutside)
    },

    beforeUnmount() {
        document.removeEventListener('click', this.handleClickOutside)
    },
}
</script>

<style scoped>
.container-login {
    position: relative;
}

.dialog {
    position: absolute;
    width: 180px;
    background-color: var(--surface-overlay, #1E2D3D);
    border: 1px solid var(--color-border, rgba(126,196,168,0.1));
    color: var(--color-text, #C4F0E0);
    bottom: -130px;
    right: 0;
    box-shadow: var(--shadow-lg, 0 4px 16px rgba(0,0,0,0.14));
    z-index: 20;
    border-radius: var(--radius-sm, 6px);
}

h2 {
    font-size: .9rem;
    color: var(--color-text, #C4F0E0);
}

.divider {
    width: 100%;
    height: 1px;
    background-color: var(--color-border, rgba(126,196,168,0.1));
}

.dialog-top {
    padding: .5rem;
}

.dialog-top>span {
    font-size: .7rem;
}

.text-secondary {
    color: var(--color-text-muted, #5A9A82);
}

.email {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    width: 155px;
}

.dialog-main {
    padding: .4rem;
}

.account {
    cursor: pointer;
    font-size: .8rem;
    color: var(--color-text, #C4F0E0);
}

a {
    text-decoration: none;
    font-size: .9rem;
    color: var(--color-text, #C4F0E0);
}

a:hover {
    color: var(--color-primary, #04A469);
}

.dialog-footer {
    padding: .4rem;
}

.signup {
    cursor: pointer;
    font-size: .8rem;
}
</style>
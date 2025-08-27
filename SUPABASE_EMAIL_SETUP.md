# Configuration des Emails Supabase

## Problème Identifié

Votre application utilise le serveur SMTP par défaut de Supabase qui a des limitations :
- ❌ N'envoie des emails qu'aux adresses pré-autorisées (membres de l'équipe)
- ❌ Limite de 2 emails par heure
- ❌ Pas adapté pour la production

## Solutions Disponibles

### 🚀 Solution Rapide (Recommandée pour les tests)

**Ajouter votre email aux membres autorisés :**

1. Allez sur [supabase.com](https://supabase.com) et connectez-vous
2. Sélectionnez votre projet
3. Allez dans **Settings** → **Team**
4. Cliquez sur **Invite** ou **Add member**
5. Ajoutez votre adresse email de test
6. Choisissez le rôle **Developer** ou **Owner**
7. Envoyez l'invitation

**Résultat :** Votre email pourra maintenant recevoir les emails de confirmation !

### 🔧 Solution Production (Recommandée pour le déploiement)

**Configurer un serveur SMTP personnalisé :**

1. Allez dans **Settings** → **Authentication**
2. Scrollez jusqu'à **SMTP Settings**
3. Configurez votre fournisseur d'email :
   - **Gmail** : Utilisez un mot de passe d'application
   - **SendGrid** : Créez une clé API
   - **Mailgun** : Utilisez vos identifiants API
   - **AWS SES** : Configurez vos clés AWS

### 🧪 Solution Temporaire (Pour les tests uniquement)

**Désactiver la confirmation par email :**

1. Allez dans **Settings** → **Authentication**
2. Trouvez **Email Confirmation**
3. Désactivez **Enable email confirmations**

⚠️ **Attention :** Cette option n'est pas recommandée pour la production car elle permet aux utilisateurs de s'inscrire sans vérifier leur email.

## Test de la Configuration

Une fois que vous avez appliqué une des solutions :

1. Ouvrez votre application
2. Cliquez sur **Diagnostic Supabase** dans la section debug
3. Utilisez le bouton **Tester l'envoi d'email**
4. Vérifiez votre boîte mail

## Diagnostic Intégré

Votre application inclut maintenant un outil de diagnostic qui vous permet de :
- ✅ Vérifier la configuration Supabase
- ✅ Tester la connexion à la base de données
- ✅ Estimer les paramètres d'email
- ✅ Tester l'envoi d'emails directement

Pour y accéder :
1. Ouvrez l'application en mode développement
2. Dans le formulaire de connexion, cliquez sur **Diagnostic Supabase**

## Prochaines Étapes

1. **Immédiat :** Ajoutez votre email aux membres du projet Supabase
2. **Court terme :** Testez l'inscription avec le diagnostic intégré
3. **Long terme :** Configurez un serveur SMTP personnalisé pour la production

---

💡 **Conseil :** Commencez par la solution rapide pour débloquer vos tests, puis configurez un SMTP personnalisé avant le déploiement en production.
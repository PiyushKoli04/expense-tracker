/* ============================================
   AUTH — auth.js
   Firebase Authentication Functions
   ============================================ */

const Auth = (() => {
  /**
   * Sign up with email and password
   * Creates user profile in Firestore after signup
   */
  async function signUpWithEmail(email, password, username) {
    try {
      const result = await auth.createUserWithEmailAndPassword(email, password);
      const user = result.user;

      // Update display name
      await user.updateProfile({ displayName: username });

      // Create user profile in Firestore
      await createUserProfile(user, { username });

      return { success: true, user };
    } catch (error) {
      console.error('Signup error:', error);
      return { success: false, error: getAuthErrorMessage(error.code) };
    }
  }

  /**
   * Login with email and password
   */
  async function loginWithEmail(email, password) {
    try {
      const result = await auth.signInWithEmailAndPassword(email, password);
      return { success: true, user: result.user };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: getAuthErrorMessage(error.code) };
    }
  }

  /**
   * Sign in with Google
   */
  async function signInWithGoogle() {
    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.addScope('email');
      provider.addScope('profile');

      const result = await auth.signInWithPopup(provider);
      const user = result.user;

      // Check if user profile exists, create if not
      const profileDoc = await db.collection('users').doc(user.uid).get();
      if (!profileDoc.exists) {
        await createUserProfile(user, {
          username: user.displayName || user.email.split('@')[0]
        });
      }

      return { success: true, user };
    } catch (error) {
      console.error('Google sign-in error:', error);
      return { success: false, error: getAuthErrorMessage(error.code) };
    }
  }

  /**
   * Logout
   */
  async function logout() {
    try {
      await auth.signOut();
      window.location.href = '/login.html';
    } catch (error) {
      console.error('Logout error:', error);
    }
  }

  /**
   * Create user profile in Firestore
   */
  async function createUserProfile(user, additionalData = {}) {
    const userRef = db.collection('users').doc(user.uid);

    const profileData = {
      uid: user.uid,
      username: additionalData.username || user.displayName || 'User',
      email: user.email,
      photoURL: user.photoURL || null,
      currency: '₹',
      theme: 'dark',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    await userRef.set(profileData, { merge: true });
    return profileData;
  }

  /**
   * Get current user profile from Firestore
   */
  async function getUserProfile(uid) {
    try {
      const doc = await db.collection('users').doc(uid).get();
      if (doc.exists) {
        return doc.data();
      }
      return null;
    } catch (error) {
      console.error('Error fetching user profile:', error);
      return null;
    }
  }

  /**
   * Update user profile
   */
  async function updateUserProfile(uid, data) {
    try {
      await db.collection('users').doc(uid).update(data);
      return { success: true };
    } catch (error) {
      console.error('Error updating profile:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get current authenticated user
   */
  function getCurrentUser() {
    return auth.currentUser;
  }

  /**
   * Auth state observer — returns a promise resolving to the user
   */
  function onAuthStateChanged(callback) {
    return auth.onAuthStateChanged(callback);
  }

  /**
   * Protect route — redirect to login if not authenticated
   */
  function protectRoute() {
    return new Promise((resolve) => {
      auth.onAuthStateChanged((user) => {
        if (!user) {
          window.location.href = '/login.html';
        } else {
          resolve(user);
        }
      });
    });
  }

  /**
   * Redirect if already authenticated (for login/signup pages)
   */
  function redirectIfAuthenticated() {
    auth.onAuthStateChanged((user) => {
      if (user) {
        window.location.href = '/dashboard.html';
      }
    });
  }

  /**
   * Convert Firebase error codes to user-friendly messages
   */
  function getAuthErrorMessage(code) {
    const messages = {
      'auth/email-already-in-use': 'An account with this email already exists.',
      'auth/invalid-email': 'Please enter a valid email address.',
      'auth/operation-not-allowed': 'This sign-in method is not enabled.',
      'auth/weak-password': 'Password must be at least 6 characters.',
      'auth/user-disabled': 'This account has been disabled.',
      'auth/user-not-found': 'No account found with this email.',
      'auth/wrong-password': 'Incorrect password. Please try again.',
      'auth/too-many-requests': 'Too many attempts. Please try again later.',
      'auth/popup-closed-by-user': 'Sign-in popup was closed.',
      'auth/network-request-failed': 'Network error. Check your connection.',
      'auth/invalid-credential': 'Invalid credentials. Please try again.',
      'auth/account-exists-with-different-credential': 'An account already exists with this email using a different sign-in method.'
    };
    return messages[code] || 'An unexpected error occurred. Please try again.';
  }

  return {
    signUpWithEmail,
    loginWithEmail,
    signInWithGoogle,
    logout,
    getUserProfile,
    updateUserProfile,
    getCurrentUser,
    onAuthStateChanged,
    protectRoute,
    redirectIfAuthenticated
  };
})();

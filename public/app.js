// Authentication logic

// Check if user is already logged in
auth.onAuthStateChanged(async (user) => {
    // Check if we're coming from an error redirect
    const urlParams = new URLSearchParams(window.location.search);
    const error = urlParams.get('error');
    
    if (error === 'access_denied') {
        showError('Access denied. This portal is only for doctors. Please contact an administrator.');
        localStorage.removeItem('idToken');
        if (user) {
            await auth.signOut();
        }
        // Clear the error from URL
        window.history.replaceState({}, document.title, '/');
        return;
    }
    
    if (error === 'auth_failed') {
        showError('Authentication failed. Please try signing in again.');
        localStorage.removeItem('idToken');
        if (user) {
            await auth.signOut();
        }
        // Clear the error from URL
        window.history.replaceState({}, document.title, '/');
        return;
    }
    
    if (user) {
        // User is signed in, redirect to dashboard
        window.location.href = 'dashboard.html';
    }
});

// Show error message
function showError(message) {
    const errorDiv = document.getElementById('error-message');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    setTimeout(() => {
        errorDiv.style.display = 'none';
    }, 5000);
}

// Show loading state
function setLoading(isLoading) {
    const loginBtn = document.getElementById('login-btn');
    const loginText = document.getElementById('login-text');
    const loginSpinner = document.getElementById('login-spinner');
    
    loginBtn.disabled = isLoading;
    loginText.style.display = isLoading ? 'none' : 'inline';
    loginSpinner.style.display = isLoading ? 'inline-block' : 'none';
}

// Email/Password Login
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    
    setLoading(true);
    
    try {
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        const user = userCredential.user;
        
        // Get Firebase ID token
        const idToken = await user.getIdToken();
        
        // Check if user exists in our system
        let response = await fetch('/api/users/me', {
            headers: {
                'Authorization': `Bearer ${idToken}`
            }
        });
        
        let userData;
        
        if (!response.ok) {
            // User doesn't exist in our database, auto-register them
            const registerResponse = await fetch('/api/users/register', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${idToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    displayName: user.displayName || email.split('@')[0],
                    role: 'patient' // Default role - admin needs to change to 'doctor'
                })
            });
            
            if (!registerResponse.ok) {
                throw new Error('Failed to register user');
            }
            
            userData = await registerResponse.json();
            
            // Check if the newly registered user data contains user info
            if (userData.user) {
                userData = userData.user;
            }
        } else {
            userData = await response.json();
        }
        
        if (userData.role !== 'doctor' && userData.role !== 'admin') {
            await auth.signOut();
            localStorage.removeItem('idToken');
            throw new Error('Access denied. This portal is only for doctors. Please contact an administrator to grant access.');
        }
        
        // Store token in localStorage
        localStorage.setItem('idToken', idToken);
        
        // Redirect to dashboard
        window.location.href = 'dashboard.html';
    } catch (error) {
        console.error('Login error:', error);
        showError(error.message || 'Failed to sign in. Please check your credentials.');
        setLoading(false);
    }
});

// Google Sign-In
document.getElementById('google-login-btn').addEventListener('click', async () => {
    try {
        const provider = new firebase.auth.GoogleAuthProvider();
        const userCredential = await auth.signInWithPopup(provider);
        const user = userCredential.user;
        
        // Get Firebase ID token
        const idToken = await user.getIdToken();
        
        // Check if user exists in our system
        let response = await fetch('/api/users/me', {
            headers: {
                'Authorization': `Bearer ${idToken}`
            }
        });
        
        let userData;
        
        if (!response.ok) {
            // User doesn't exist in our database
            // Note: New users are registered as 'patient' by default
            // An admin must change their role to 'doctor' in the database
            const registerResponse = await fetch('/api/users/register', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${idToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    displayName: user.displayName,
                    role: 'patient' // Default role - admin needs to change to 'doctor'
                })
            });
            
            if (!registerResponse.ok) {
                throw new Error('Failed to register user');
            }
            
            userData = await registerResponse.json();
            
            // Check if the newly registered user data contains user info
            if (userData.user) {
                userData = userData.user;
            }
        } else {
            userData = await response.json();
        }
        
        // Check if user is a doctor or admin
        if (userData.role !== 'doctor' && userData.role !== 'admin') {
            await auth.signOut();
            localStorage.removeItem('idToken');
            throw new Error('Access denied. This portal is only for doctors. Please contact an administrator to grant access.');
        }
        
        // Store token
        localStorage.setItem('idToken', idToken);
        
        // Redirect to dashboard
        window.location.href = 'dashboard.html';
    } catch (error) {
        console.error('Google login error:', error);
        showError(error.message || 'Failed to sign in with Google.');
    }
});


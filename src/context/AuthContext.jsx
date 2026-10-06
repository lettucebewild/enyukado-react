import { createContext, useContext, useState, useCallback } from 'react';

const AuthContext = createContext(null);

function readStoredUser() {
  const token = localStorage.getItem('userToken');
  if (!token) return null;
  return {
    token,
    firstName: localStorage.getItem('userName'),
    lastName: localStorage.getItem('userLastName'),
    email: localStorage.getItem('userEmail'),
    profileImage: localStorage.getItem('userProfileImage'),
    isFirstLogin: localStorage.getItem('userFirstLogin') === 'true',
    id: localStorage.getItem('userID'),
  };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readStoredUser);

  const signIn = useCallback((data) => {
    localStorage.setItem('userToken', data.token);
    localStorage.setItem('userName', data.user.firstName);
    localStorage.setItem('userLastName', data.user.lastName);
    localStorage.setItem('userEmail', data.user.email);
    localStorage.setItem('userID', data.user.id);
    localStorage.setItem('userFirstLogin', String(data.user.isFirstLogin === true));
    if (data.user.profileImage) localStorage.setItem('userProfileImage', data.user.profileImage);
    else localStorage.removeItem('userProfileImage');
    setUser({ token: data.token, ...data.user });
  }, []);

  const updateUser = useCallback((patch) => {
    setUser((u) => {
      if (!u) return u;
      if (patch.firstName !== undefined) localStorage.setItem('userName', patch.firstName);
      if (patch.lastName !== undefined) localStorage.setItem('userLastName', patch.lastName);
      if (patch.profileImage !== undefined) {
        if (patch.profileImage) localStorage.setItem('userProfileImage', patch.profileImage);
        else localStorage.removeItem('userProfileImage');
      }
      return { ...u, ...patch };
    });
  }, []);

  const signOut = useCallback(() => {
    ['userToken', 'userName', 'userLastName', 'userEmail', 'userProfileImage', 'userID', 'userFirstLogin'].forEach((k) =>
      localStorage.removeItem(k)
    );
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, signIn, signOut, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

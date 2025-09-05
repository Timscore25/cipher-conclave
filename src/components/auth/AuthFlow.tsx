import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAuthStore } from '@/lib/stores/auth-store';
import { Lock, Shield, Users } from 'lucide-react';

export default function AuthFlow() {
  const { signIn, signUp, resendConfirmation, loading, emailConfirmationRequired } = useAuthStore();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  const [signInForm, setSignInForm] = useState({
    email: '',
    password: '',
  });

  const [signUpForm, setSignUpForm] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    displayName: '',
  });

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const { error } = await signIn(signInForm.email, signInForm.password);
    if (error) {
      setError(error.message);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (signUpForm.password !== signUpForm.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (signUpForm.password.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }

    const { error, emailConfirmationRequired } = await signUp(
      signUpForm.email, 
      signUpForm.password, 
      signUpForm.displayName
    );
    
    if (error) {
      setError(error.message);
    } else if (emailConfirmationRequired) {
      setSuccess('Account created! Please check your email and click the confirmation link to complete registration.');
    }
  };

  const handleResendConfirmation = async () => {
    setError(null);
    setSuccess(null);
    
    const email = signInForm.email || signUpForm.email;
    if (!email) {
      setError('Please enter your email address');
      return;
    }
    
    const { error } = await resendConfirmation(email);
    if (error) {
      setError(error.message);
    } else {
      setSuccess('Confirmation email sent! Please check your inbox.');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-secondary/20 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 bg-primary rounded-xl flex items-center justify-center">
            <Lock className="w-8 h-8 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              PGPRooms
            </h1>
            <p className="text-muted-foreground mt-2">
              End-to-end encrypted group chat
            </p>
          </div>
        </div>

        {/* Features showcase */}
        <div className="grid grid-cols-3 gap-4 py-4">
          <div className="text-center space-y-2">
            <Shield className="w-6 h-6 mx-auto text-accent" />
            <p className="text-xs text-muted-foreground">E2E Encrypted</p>
          </div>
          <div className="text-center space-y-2">
            <Users className="w-6 h-6 mx-auto text-accent" />
            <p className="text-xs text-muted-foreground">Group Chat</p>
          </div>
          <div className="text-center space-y-2">
            <Lock className="w-6 h-6 mx-auto text-accent" />
            <p className="text-xs text-muted-foreground">Zero Knowledge</p>
          </div>
        </div>

        {/* Auth Forms */}
        <Card className="border-border/50 shadow-lg">
          <Tabs defaultValue="signin" className="w-full">
            <CardHeader className="space-y-1">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">Sign In</TabsTrigger>
                <TabsTrigger value="signup">Sign Up</TabsTrigger>
              </TabsList>
            </CardHeader>

            <CardContent>
              {error && (
                <Alert variant="destructive" className="mb-4">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              
              {success && (
                <Alert className="mb-4 border-green-200 bg-green-50">
                  <AlertDescription className="text-green-800">{success}</AlertDescription>
                </Alert>
              )}

              {emailConfirmationRequired && (
                <Alert className="mb-4 border-blue-200 bg-blue-50">
                  <AlertDescription className="text-blue-800">
                    Please check your email and click the confirmation link to complete your registration.
                    <Button 
                      variant="link" 
                      className="p-0 h-auto text-blue-600 underline ml-1"
                      onClick={handleResendConfirmation}
                      disabled={loading}
                    >
                      Resend confirmation email
                    </Button>
                  </AlertDescription>
                </Alert>
              )}

              <TabsContent value="signin" className="space-y-4">
                <form onSubmit={handleSignIn} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signin-email">Email</Label>
                    <Input
                      id="signin-email"
                      type="email"
                      placeholder="Enter your email"
                      value={signInForm.email}
                      onChange={(e) => setSignInForm({ ...signInForm, email: e.target.value })}
                      required
                      disabled={loading}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signin-password">Password</Label>
                    <Input
                      id="signin-password"
                      type="password"
                      placeholder="Enter your password"
                      value={signInForm.password}
                      onChange={(e) => setSignInForm({ ...signInForm, password: e.target.value })}
                      required
                      disabled={loading}
                    />
                  </div>

                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? 'Signing In...' : 'Sign In'}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup" className="space-y-4">
                <form onSubmit={handleSignUp} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signup-name">Display Name</Label>
                    <Input
                      id="signup-name"
                      type="text"
                      placeholder="Your display name"
                      value={signUpForm.displayName}
                      onChange={(e) => setSignUpForm({ ...signUpForm, displayName: e.target.value })}
                      required
                      disabled={loading}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-email">Email</Label>
                    <Input
                      id="signup-email"
                      type="email"
                      placeholder="Enter your email"
                      value={signUpForm.email}
                      onChange={(e) => setSignUpForm({ ...signUpForm, email: e.target.value })}
                      required
                      disabled={loading}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-password">Password</Label>
                    <Input
                      id="signup-password"
                      type="password"
                      placeholder="Choose a strong password"
                      value={signUpForm.password}
                      onChange={(e) => setSignUpForm({ ...signUpForm, password: e.target.value })}
                      required
                      disabled={loading}
                      minLength={8}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-confirm">Confirm Password</Label>
                    <Input
                      id="signup-confirm"
                      type="password"
                      placeholder="Confirm your password"
                      value={signUpForm.confirmPassword}
                      onChange={(e) => setSignUpForm({ ...signUpForm, confirmPassword: e.target.value })}
                      required
                      disabled={loading}
                      minLength={8}
                    />
                  </div>

                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? 'Creating Account...' : 'Create Account'}
                  </Button>
                </form>
              </TabsContent>
            </CardContent>
          </Tabs>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          Your private keys never leave your device. We cannot read your messages.
        </p>
      </div>
    </div>
  );
}
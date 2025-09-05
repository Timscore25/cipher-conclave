import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ExternalLink, AlertCircle } from 'lucide-react';

export default function AuthFix() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-lg w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertCircle className="w-5 h-5" />
            Authentication Not Available
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert variant="destructive">
            <AlertDescription>
              Email authentication is currently disabled in your Supabase project. 
              You need to enable it to sign in.
            </AlertDescription>
          </Alert>
          
          <div className="space-y-3">
            <h3 className="font-semibold">How to fix this:</h3>
            <ol className="list-decimal list-inside space-y-2 text-sm">
              <li>Go to your Supabase Dashboard</li>
              <li>Navigate to Authentication → Providers</li>
              <li>Enable the <strong>Email</strong> provider</li>
              <li>Optionally disable "Confirm email" for faster testing</li>
              <li>Come back and try signing in</li>
            </ol>
          </div>

          <Button 
            className="w-full" 
            onClick={() => window.open('https://supabase.com/dashboard/project/ddttwqzfbzjntxieeusd/auth/providers', '_blank')}
          >
            <ExternalLink className="w-4 h-4 mr-2" />
            Open Supabase Dashboard
          </Button>

          <div className="text-xs text-muted-foreground">
            Project ID: ddttwqzfbzjntxieeusd
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
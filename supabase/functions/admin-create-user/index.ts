import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Admin create user function called');
    
    // Create admin client with service role key
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    const { email, password, displayName = 'Test User' } = await req.json();
    
    if (!email || !password) {
      return new Response(
        JSON.stringify({ error: 'Email and password are required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'content-type': 'application/json' }
        }
      );
    }

    console.log('Creating user with email:', email);
    
    // Create user with admin API (bypasses email confirmation)
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm email
      user_metadata: {
        display_name: displayName
      }
    });

    if (error) {
      console.error('Error creating user:', error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'content-type': 'application/json' }
        }
      );
    }

    console.log('User created successfully:', data.user?.id, data.user?.email);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        user: data.user,
        message: `User ${email} created successfully`
      }),
      { 
        headers: { ...corsHeaders, 'content-type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Unexpected error in admin-create-user:', error);
    
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'content-type': 'application/json' }
      }
    );
  }
});
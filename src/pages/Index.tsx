import AuthWrapper from '@/components/auth/AuthWrapper';
import MainLayout from '@/components/chat/MainLayout';

const Index = () => {
  return (
    <AuthWrapper>
      <MainLayout />
    </AuthWrapper>
  );
};

export default Index;

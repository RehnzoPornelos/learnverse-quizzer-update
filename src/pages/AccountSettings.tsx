
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Navbar from '@/components/layout/Navbar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Upload } from 'lucide-react';

const AccountSettings = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
    
    if (user) {
      setEmail(user.email || '');
      
      // Get user metadata
      const metadata = user.user_metadata;
      if (metadata) {
        setFullName(metadata.full_name || '');
        setAvatarUrl(metadata.avatar_url || null);
      }
    }
  }, [user]);

  const handleProfileUpdate = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      
      const { error } = await supabase.auth.updateUser({
        data: { full_name: fullName }
      });
      
      if (error) throw error;
      
      toast.success('Profile updated successfully');
    } catch (error) {
      console.error('Error updating profile:', error);
      toast.error('Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  const handleAvatarChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!user || !event.target.files || event.target.files.length === 0) {
      return;
    }
    
    try {
      setUploadingAvatar(true);
      const file = event.target.files[0];
      const fileExt = file.name.split('.').pop();
      const filePath = `${user.id}/avatar.${fileExt}`;
      
      // Upload image to storage
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true });
        
      if (uploadError) throw uploadError;
      
      // Get the public URL
      const { data } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);
        
      const avatarUrl = data.publicUrl;
      
      // Update user metadata with avatar URL
      const { error: updateError } = await supabase.auth.updateUser({
        data: { avatar_url: avatarUrl }
      });
      
      if (updateError) throw updateError;
      
      setAvatarUrl(avatarUrl);
      toast.success('Avatar updated successfully');
      
    } catch (error) {
      console.error('Error uploading avatar:', error);
      toast.error('Failed to update avatar');
    } finally {
      setUploadingAvatar(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen bg-muted/20"
    >
      <Navbar />
      <main className="pt-20">
        <div className="container-content py-8">
          <div className="flex flex-col space-y-8 max-w-2xl mx-auto">
            <div>
              <h1 className="text-3xl font-bold">Account Settings</h1>
              <p className="text-muted-foreground mt-1">Manage your account preferences and profile</p>
            </div>
            
            <Card>
              <CardHeader>
                <CardTitle>Profile Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex flex-col space-y-2 items-center sm:flex-row sm:space-y-0 sm:space-x-4">
                  <div className="relative">
                    <Avatar className="h-24 w-24">
                      <AvatarImage src={avatarUrl || undefined} alt={fullName} />
                      <AvatarFallback className="text-lg">
                        {fullName
                          .split(' ')
                          .map(name => name[0])
                          .join('')
                          .toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    
                    {uploadingAvatar && (
                      <div className="absolute inset-0 bg-background/80 rounded-full flex items-center justify-center">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      </div>
                    )}
                  </div>
                  
                  <div className="flex-1">
                    <Label htmlFor="avatar" className="block font-medium mb-1">Profile Picture</Label>
                    <div className="flex items-center">
                      <label
                        htmlFor="avatar-upload"
                        className="cursor-pointer bg-muted hover:bg-muted/80 text-sm px-4 py-2 rounded flex items-center"
                      >
                        <Upload className="mr-2 h-4 w-4" />
                        Upload Image
                      </label>
                      <input
                        id="avatar-upload"
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        onChange={handleAvatarChange}
                        disabled={uploadingAvatar}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Recommended: Square image, at least 200x200px
                    </p>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div className="space-y-1">
                    <Label htmlFor="full-name">Full Name</Label>
                    <Input
                      id="full-name"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Your full name"
                    />
                  </div>
                  
                  <div className="space-y-1">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      disabled
                      className="bg-muted"
                    />
                    <p className="text-xs text-muted-foreground">
                      Email cannot be changed
                    </p>
                  </div>
                </div>
                
                <div className="pt-4">
                  <Button 
                    onClick={handleProfileUpdate} 
                    disabled={loading || !fullName.trim()}
                    className="w-full sm:w-auto"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : 'Save Changes'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </motion.div>
  );
};

export default AccountSettings;

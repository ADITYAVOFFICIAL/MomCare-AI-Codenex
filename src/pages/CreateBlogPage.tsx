// src/pages/CreateBlogPage.tsx (or wherever this component lives)
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import MainLayout from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
// --- Ensure the path to appwrite is correct ---
import { createBlogPost } from '@/lib/appwrite';
import { useAuthStore } from '@/store/authStore';

const CreateBlogPage = () => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  // --- Add state for tags if you plan to use them ---
  // const [tags, setTags] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuthStore();

  // Categories for the blog
  const categories = [
    'Pregnancy',
    'Childbirth',
    'Postpartum',
    'Nutrition',
    'Exercise',
    'Mental Health',
    'Baby Care',
    'Parenting'
  ];

  // Authorization check (remains the same)
  useEffect(() => {
    // Allow time for auth state to potentially load
    if (isAuthenticated === false) { // Explicitly check for false after loading
        toast({
            title: "Authentication Required",
            description: "Please log in to create blog posts.",
            variant: "destructive",
        });
        navigate('/login'); // Redirect to login
    } else if (isAuthenticated === true && user?.email !== 'adityav1304@gmail.com') {
        toast({
            title: "Unauthorized",
            description: "You are not authorized to create blog posts.",
            variant: "destructive",
        });
        navigate('/resources'); // Redirect to resources or home
    }
    // If isAuthenticated is null (initial state), do nothing, wait for it to resolve
  }, [isAuthenticated, user, navigate, toast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Ensure user is loaded and authenticated before submitting
    if (!isAuthenticated || !user || user.email !== 'adityav1304@gmail.com') {
       toast({
         title: "Authorization Error",
         description: "Cannot create post. Please ensure you are logged in with the correct account.",
         variant: "destructive",
       });
       setIsLoading(false); // Stop loading if triggered
       return;
    }


    if (!title || !content || !category) {
      toast({
        title: "Missing information",
        description: "Please fill in Title, Content, and Category.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      // --- FIX: Pass a single object matching the BlogPost structure ---
      // Ensure the keys (title, content, author, category, imageUrl)
      // match the attribute names defined in your Appwrite Blog collection.
      const postData = {
        title: title,
        content: content,
        author: user.name || 'MomCare Team', // Use loaded user's name
        category: category,
        // Only include imageUrl if it has a value, otherwise pass undefined (or omit)
        imageUrl: imageUrl || undefined,
        // Add tags if you implement them:
        // tags: tags,
      };

      console.log("Submitting Blog Post Data:", postData); // Debug log

      await createBlogPost(postData);
      // --- End Fix ---

      toast({
        title: "Blog post created",
        description: "Your blog post has been published successfully.",
      });

      // Reset form
      setTitle('');
      setContent('');
      setCategory('');
      setImageUrl('');
      // setTags([]); // Reset tags if implemented

      // Redirect to resources page
      navigate('/resources');

    } catch (error: any) { // Catch specific error type if possible
      console.error('Error creating blog post:', error);

      // Provide more specific feedback if possible
      let description = "An unexpected error occurred. Please try again later.";
      if (error?.message) {
          // Check for common Appwrite errors or display the message
          if (error.message.includes("Invalid `data` param")) {
              description = "There was an issue with the data format. Please check your inputs.";
          } else if (error.code === 401 || error.code === 403) {
              description = "Authorization failed. Please ensure you are logged in correctly.";
          } else {
              description = error.message; // Display Appwrite's message directly (use with caution in production)
          }
      }

      toast({
        title: "Failed to create blog post",
        description: description,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Loading state or unauthorized view (improved check)
  if (isAuthenticated === null) {
     // Optional: Show a loading indicator while auth state resolves
     return (
        <MainLayout>
            <div className="flex items-center justify-center min-h-[calc(100vh-16rem)]">
                <Loader2 className="h-8 w-8 animate-spin text-momcare-primary" />
            </div>
        </MainLayout>
     )
  }

  if (isAuthenticated === false || (isAuthenticated === true && user?.email !== 'adityav1304@gmail.com')) {
    // Render the unauthorized view (as before)
    return (
      <MainLayout>
        <div className="flex items-center justify-center min-h-[calc(100vh-16rem)]">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="text-center">Unauthorized Access</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-center">You do not have permission to create blog posts.</p>
            </CardContent>
            <CardFooter className="flex justify-center">
              <Button onClick={() => navigate('/resources')}>
                Return to Resources
              </Button>
            </CardFooter>
          </Card>
        </div>
      </MainLayout>
    );
  }

  // Render the form if authorized
  return (
    <MainLayout>
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-momcare-primary">Create Blog Post</h1>
          <p className="text-gray-600 mt-2">
            Share your knowledge and insights with the MomCare community
          </p>
        </div>

        <Card className="border-momcare-primary/20">
          <form onSubmit={handleSubmit}>
            <CardHeader>
              <CardTitle>New Blog Post Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6"> {/* Increased spacing */}
              <div className="space-y-2">
                <Label htmlFor="title">Title *</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Enter a clear and engaging title"
                  required
                  maxLength={100} // Example constraint
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="category">Category *</Label>
                <Select value={category} onValueChange={setCategory} required>
                  <SelectTrigger id="category">
                    <SelectValue placeholder="Select a relevant category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="imageUrl">Cover Image URL (Optional)</Label>
                <Input
                  id="imageUrl"
                  type="url" // Use type="url" for basic validation
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://example.com/your-image.jpg"
                />
                <p className="text-xs text-gray-500">
                  Link to an image that represents your post (e.g., from Unsplash, Pexels).
                </p>
              </div>

              {/* Optional: Add Tags Input Here if needed */}
              {/*
              <div className="space-y-2">
                <Label htmlFor="tags">Tags (Optional, comma-separated)</Label>
                <Input
                  id="tags"
                  value={tags.join(', ')}
                  onChange={(e) => setTags(e.target.value.split(',').map(tag => tag.trim()).filter(Boolean))}
                  placeholder="e.g., nutrition, first trimester, tips"
                />
              </div>
              */}

              <div className="space-y-2">
                <Label htmlFor="content">Content *</Label>
                <Textarea
                  id="content"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Write your blog post content here. Use paragraphs for readability."
                  className="min-h-[300px] lg:min-h-[400px]" // Taller textarea
                  required
                />
              </div>
            </CardContent>

            <CardFooter className="flex justify-between items-center pt-6 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate('/resources')}
                disabled={isLoading} // Disable cancel while loading
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-momcare-primary hover:bg-momcare-dark min-w-[150px]" // Ensure button width
                disabled={isLoading || !title || !content || !category} // Disable if required fields missing or loading
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Publishing...
                  </>
                ) : (
                  "Publish Blog Post"
                )}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </MainLayout>
  );
};

export default CreateBlogPage;
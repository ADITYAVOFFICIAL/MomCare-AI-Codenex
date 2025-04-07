// src/pages/EditBlogPage.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import MainLayout from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Sparkles, AlertTriangle } from 'lucide-react';
import { getBlogPostBySlug, updateBlogPost, BlogPost, UpdateBlogPostData } from '@/lib/appwrite'; // Import update function and types
import { useAuthStore } from '@/store/authStore';
import MdEditor from 'react-markdown-editor-lite';
import ReactMarkdown from 'react-markdown';
import 'react-markdown-editor-lite/lib/index.css';
import { formatContentWithGemini } from '@/lib/geminif';

// Helper function (can be moved to a utils file)
const generateSlug = (text: string): string => {
  if (!text) return '';
  return text.toLowerCase().trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
};

const EditBlogPage = () => {
  const { slug: routeSlug } = useParams<{ slug: string }>(); // Get slug from URL
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, isAuthenticated } = useAuthStore();

  // State for form fields
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [isSlugManuallyEdited, setIsSlugManuallyEdited] = useState(false);
  const [contentMd, setContentMd] = useState<string>('');
  const [category, setCategory] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [originalPost, setOriginalPost] = useState<BlogPost | null>(null); // Store the fetched post

  // State for loading/error/formatting
  const [isLoading, setIsLoading] = useState(false); // For form submission
  const [isFetching, setIsFetching] = useState(true); // For initial data fetch
  const [isFormatting, setIsFormatting] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const categories = [
    'Pregnancy', 'Childbirth', 'Postpartum', 'Nutrition', 'Exercise',
    'Mental Health', 'Baby Care', 'Parenting', 'General Wellness',
    'Tips & Tricks', 'Community Stories'
  ];

  // Authorization check
  useEffect(() => {
    if (isAuthenticated === false) {
      toast({ title: "Authentication Required", description: "Please log in to edit blog posts.", variant: "destructive" });
      navigate('/login');
    } else if (isAuthenticated === true && user?.email !== 'adityav1304@gmail.com') { // Admin check
      toast({ title: "Unauthorized", description: "You are not authorized to edit blog posts.", variant: "destructive" });
      navigate('/resources');
    }
  }, [isAuthenticated, user, navigate, toast]);

  // Fetch existing post data
  useEffect(() => {
    const fetchPostData = async () => {
      if (!routeSlug) {
        setFetchError("No blog post specified in the URL.");
        setIsFetching(false);
        return;
      }
      if (isAuthenticated === false || (isAuthenticated === true && user?.email !== 'adityav1304@gmail.com')) {
         // Don't fetch if user isn't authorized (already handled by redirect, but good practice)
         setIsFetching(false);
         return;
      }

      setIsFetching(true);
      setFetchError(null);
      try {
        const post = await getBlogPostBySlug(routeSlug);
        if (post) {
          setOriginalPost(post);
          setTitle(post.title);
          setSlug(post.slug);
          setContentMd(post.content);
          setCategory(post.category || '');
          setImageUrl(post.imageUrl || '');
          setIsSlugManuallyEdited(true); // Assume slug was set, treat as manual edit initially
        } else {
          setFetchError(`Blog post with slug "${routeSlug}" not found.`);
          toast({ title: "Not Found", description: `Could not find the blog post to edit.`, variant: "destructive" });
          navigate('/resources'); // Redirect if post not found
        }
      } catch (error: any) {
        console.error("Error fetching blog post for edit:", error);
        setFetchError(error.message || "Failed to load blog post data.");
        toast({ title: "Loading Error", description: "Could not load post data.", variant: "destructive" });
      } finally {
        setIsFetching(false);
      }
    };

    // Fetch only when authenticated and authorized
    if (isAuthenticated === true && user?.email === 'adityav1304@gmail.com') {
        fetchPostData();
    } else if (isAuthenticated === null) {
        // Still authenticating, wait...
        setIsFetching(true);
    } else {
        // Not authenticated or not authorized
        setIsFetching(false);
    }

  }, [routeSlug, navigate, toast, isAuthenticated, user]); // Add auth dependencies

  // Slug generation/handling (same as CreateBlogPage, but respects initial load)
  useEffect(() => {
    if (!isSlugManuallyEdited && title && !isFetching) { // Don't auto-generate during fetch
      setSlug(generateSlug(title));
    }
  }, [title, isSlugManuallyEdited, isFetching]);

  const handleSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newSlug = e.target.value;
    const sanitizedSlug = newSlug.toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/--+/g, '-');
    setSlug(sanitizedSlug);
    setIsSlugManuallyEdited(true);
    if (!sanitizedSlug && title) {
      setIsSlugManuallyEdited(false);
      setSlug(generateSlug(title));
    } else if (!sanitizedSlug && !title) {
      setIsSlugManuallyEdited(false);
    }
  };

  const handleEditorChange = ({ text }: { html: string; text: string }) => {
    setContentMd(text);
  };

  // AI Formatting Handler (same as CreateBlogPage)
  const handleFormatContent = useCallback(async () => {
    if (!contentMd?.trim()) {
      toast({ title: "Nothing to Format", description: "Content is empty.", variant: "default" });
      return;
    }
    setIsFormatting(true);
    try {
      const formattedContent = await formatContentWithGemini(contentMd);
      setContentMd(formattedContent);
      toast({
        title: "Content Formatted",
        description: "Content has been automatically formatted using AI.",
        variant: "default"
      });
    } catch (error: any) {
      toast({
        title: "Formatting Error",
        description: error.message || "Could not format content via AI.",
        variant: "destructive"
      });
      console.error("Gemini formatting error:", error);
    } finally {
      setIsFormatting(false);
    }
  }, [contentMd, toast]);

  // Form Submission Handler (Update)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!originalPost?.$id) {
        toast({ title: "Error", description: "Cannot update post: Original post data missing.", variant: "destructive" });
        return;
    }
    if (!isAuthenticated || user?.email !== 'adityav1304@gmail.com') {
      toast({ title: "Unauthorized", description: "Cannot submit changes.", variant: "destructive" });
      return;
    }
    // Validation
    if (!title || !slug || !contentMd.trim() || !category) {
      toast({ title: "Missing Fields", description: "Please fill in Title, Slug, Content, and Category.", variant: "destructive" });
      return;
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      toast({ title: "Invalid Slug Format", description: "Slug format is invalid.", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    try {
      const updateData: UpdateBlogPostData = {
        title: title.trim(),
        slug: slug,
        content: contentMd, // Use potentially AI-formatted Markdown
        category: category,
        imageUrl: imageUrl.trim() || undefined,
        // Add other fields like tags if they are editable
        // tags: updatedTags,
      };

      // Important: Only send fields that have actually changed to avoid unnecessary updates
      // (or let updateBlogPost handle filtering undefined) - current appwrite.ts handles it.

      const updatedPost = await updateBlogPost(originalPost.$id, updateData);
      toast({ title: "Blog post updated", description: "Changes saved successfully." });
      navigate(`/blog/${updatedPost.slug}`); // Navigate to the updated post view
    } catch (error: any) {
      console.error('Error updating blog post:', error);
      toast({ title: "Failed to update blog post", description: error.message || "An unexpected error occurred.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  // --- Render Logic ---

  if (isFetching) {
    return (
      <MainLayout>
        <div className="flex justify-center items-center h-[calc(100vh-10rem)]">
          <Loader2 className="h-12 w-12 animate-spin text-momcare-primary" />
        </div>
      </MainLayout>
    );
  }

  if (fetchError) {
    return (
      <MainLayout>
        <div className="max-w-md mx-auto mt-10 text-center p-6 bg-destructive/10 border border-destructive rounded-lg">
           <AlertTriangle className="h-10 w-10 text-destructive mx-auto mb-4" />
           <h2 className="text-xl font-semibold text-destructive mb-2">Error Loading Post</h2>
           <p className="text-destructive/90 mb-6">{fetchError}</p>
           <Button variant="outline" onClick={() => navigate('/resources')}>
               Back to Resources
           </Button>
        </div>
      </MainLayout>
    );
  }

  // Unauthorized state (redundant due to useEffect but safe)
  if (isAuthenticated === false || (isAuthenticated === true && user?.email !== 'adityav1304@gmail.com')) {
    return (
      <MainLayout>
        <div className="max-w-md mx-auto mt-10 text-center">
          <Card>
            <CardHeader><CardTitle>Unauthorized</CardTitle></CardHeader>
            <CardContent><p>You do not have permission to access this page.</p></CardContent>
            <CardFooter><Button onClick={() => navigate('/')}>Go Home</Button></CardFooter>
          </Card>
        </div>
      </MainLayout>
    );
  }

  // Render Edit Form
  return (
    <MainLayout>
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-momcare-primary">Edit Blog Post</h1>
          <p className="text-gray-600 mt-2">Make changes to the blog post content and details.</p>
        </div>

        <Card className="border-momcare-primary/20 shadow-md">
          <form onSubmit={handleSubmit}>
            <CardHeader><CardTitle>Edit Post Details</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              {/* Title Input */}
              <div className="space-y-2">
                <Label htmlFor="title">Title *</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Enter a clear and engaging title"
                  required
                  maxLength={100}
                  disabled={isLoading || isFormatting}
                />
              </div>
              {/* Slug Input */}
              <div className="space-y-2">
                <Label htmlFor="slug">Slug *</Label>
                <Input
                  id="slug"
                  value={slug}
                  onChange={handleSlugChange}
                  placeholder="e.g., my-awesome-post"
                  required
                  maxLength={255}
                  pattern="^[a-z0-9]+(?:-[a-z0-9]+)*$"
                  title="Use lowercase letters, numbers, and hyphens only"
                  disabled={isLoading || isFormatting}
                />
                <p className="text-xs text-gray-500">URL-friendly identifier. Be careful changing this, it affects the link.</p>
              </div>
              {/* Category Select */}
              <div className="space-y-2">
                <Label htmlFor="category">Category *</Label>
                <Select value={category} onValueChange={setCategory} required disabled={isLoading || isFormatting}>
                  <SelectTrigger id="category">
                    <SelectValue placeholder="Select a relevant category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {/* Image URL Input */}
              <div className="space-y-2">
                <Label htmlFor="imageUrl">Cover Image URL (Optional)</Label>
                <Input
                  id="imageUrl"
                  type="url"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://example.com/your-image.jpg"
                  disabled={isLoading || isFormatting}
                />
              </div>

              {/* Editor Section with AI Format Button */}
              <div className="space-y-2">
                <div className="flex justify-between items-center mb-1">
                  <Label htmlFor="content-editor">Content (Markdown) *</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleFormatContent}
                    disabled={isFormatting || isLoading || !contentMd?.trim()}
                    title="Auto-format content using AI"
                  >
                    {isFormatting ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="mr-2 h-4 w-4 text-yellow-500" />
                    )}
                    AI Format
                  </Button>
                </div>
                <MdEditor
                  id="content-editor"
                  style={{ height: '450px', border: '1px solid hsl(var(--input))', borderRadius: 'var(--radius)' }}
                  value={contentMd}
                  renderHTML={text => (
                    <div className="prose max-w-none p-2 dark:prose-invert">
                      <ReactMarkdown>{text}</ReactMarkdown>
                    </div>
                  )}
                  onChange={handleEditorChange}
                  config={{
                    view: { menu: true, md: true, html: false },
                    canView: { menu: true, md: true, html: false, fullScreen: true, hideMenu: true },
                    markdownClass: 'markdown-body',
                  }}
                  // readOnly={isLoading || isFormatting} // Optionally disable editor during loads
                />
                {!contentMd?.trim() && <p className="text-xs text-destructive pt-1">Content is required.</p>}
              </div>

            </CardContent>
            <CardFooter className="flex justify-between items-center pt-6 border-t">
              <Button type="button" variant="outline" onClick={() => navigate(`/blog/${originalPost?.slug || ''}`)} disabled={isLoading || isFormatting}>
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-momcare-primary hover:bg-momcare-dark min-w-[150px]"
                disabled={isLoading || isFormatting || !title || !slug || !contentMd.trim() || !category}
              >
                {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving Changes...</> : "Save Changes"}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </MainLayout>
  );
};

export default EditBlogPage;
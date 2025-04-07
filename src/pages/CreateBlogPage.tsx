// src/pages/CreateBlogPage.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import MainLayout from '@/components/layout/MainLayout'; // Ensure this path is correct
import { Button } from '@/components/ui/button'; // Ensure this path is correct
import { Input } from '@/components/ui/input'; // Ensure this path is correct
import { Label } from '@/components/ui/label'; // Ensure this path is correct
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'; // Ensure this path is correct
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'; // Ensure this path is correct
import { useToast } from '@/hooks/use-toast'; // Ensure this path is correct
import { Loader2, Sparkles } from 'lucide-react';
import { createBlogPost } from '@/lib/appwrite'; // Ensure this path is correct
import { useAuthStore } from '@/store/authStore'; // Ensure this path is correct

// --- Markdown Editor Imports ---
import MdEditor from 'react-markdown-editor-lite';
import ReactMarkdown from 'react-markdown';
import 'react-markdown-editor-lite/lib/index.css';

// --- Formatting Imports ---
import { formatContentWithGemini } from '@/lib/geminif'; // Ensure this path is correct

// Helper function to generate a URL-friendly slug
const generateSlug = (text: string): string => {
  if (!text) return '';
  return text.toLowerCase().trim()
    .replace(/\s+/g, '-') // Replace spaces with -
    .replace(/[^\w-]+/g, '') // Remove all non-word chars except -
    .replace(/--+/g, '-') // Replace multiple - with single -
    .replace(/^-+/, '') // Trim - from start of text
    .replace(/-+$/, ''); // Trim - from end of text
};

const CreateBlogPage = () => {
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [isSlugManuallyEdited, setIsSlugManuallyEdited] = useState(false);
  const [contentMd, setContentMd] = useState<string>('');
  const [category, setCategory] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false); // For main form submission
  const [isFormatting, setIsFormatting] = useState(false); // State for AI format button loader
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuthStore();

  const categories = [
    'Pregnancy', 'Childbirth', 'Postpartum', 'Nutrition', 'Exercise',
    'Mental Health', 'Baby Care', 'Parenting', 'General Wellness',
    'Tips & Tricks', 'Community Stories'
  ];

  // Authorization check
  useEffect(() => {
    // Check runs only when isAuthenticated changes from null
    if (isAuthenticated === false) {
      toast({ title: "Authentication Required", description: "Please log in to create blog posts.", variant: "destructive" });
      navigate('/login');
    } else if (isAuthenticated === true && user?.email !== 'adityav1304@gmail.com') { // Replace with your actual admin check logic
      toast({ title: "Unauthorized", description: "You are not authorized to create blog posts.", variant: "destructive" });
      navigate('/resources'); // Redirect non-admins away
    }
  }, [isAuthenticated, user, navigate, toast]);

  // Slug generation effect
  useEffect(() => {
    if (!isSlugManuallyEdited && title) {
      setSlug(generateSlug(title));
    } else if (!title) {
      // Clear slug if title is cleared, unless manually edited
      if (!isSlugManuallyEdited) {
        setSlug('');
      }
    }
  }, [title, isSlugManuallyEdited]);

  // Slug input handler
  const handleSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newSlug = e.target.value;
    // Allow manual editing, sanitize slightly
    const sanitizedSlug = newSlug.toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/--+/g, '-');
    setSlug(sanitizedSlug);
    // Mark as manually edited if user types anything
    setIsSlugManuallyEdited(true);
    // If user clears the manual slug, revert to auto-generation if title exists
    if (!sanitizedSlug && title) {
      setIsSlugManuallyEdited(false);
      setSlug(generateSlug(title));
    } else if (!sanitizedSlug && !title) {
      // If both are cleared, reset manual edit flag
      setIsSlugManuallyEdited(false);
    }
  };

  // Editor change handler
  const handleEditorChange = ({ text }: { html: string; text: string }) => {
    setContentMd(text);
  };

  // --- Updated Handle Content Formatting using Gemini ---
  const handleFormatContent = useCallback(async () => {
    if (!contentMd?.trim()) {
      toast({ title: "Nothing to Format", description: "Content is empty.", variant: "default" });
      return;
    }
    setIsFormatting(true);
    try {
      console.log("Attempting to format content with Gemini...");
      const formattedContent = await formatContentWithGemini(contentMd);
      setContentMd(formattedContent);
      toast({
        title: "Content Formatted",
        description: "Content has been automatically formatted using AI.",
        // FIX 1: Changed variant from "success" to "default"
        variant: "default"
      });
    } catch (error: any) {
      toast({
        title: "Formatting Error",
        description: error.message || "Could not format content via AI.",
        variant: "destructive"
      });
      console.error("Gemini formatting error in handler:", error);
    } finally {
      setIsFormatting(false);
    }
  }, [contentMd, toast]);

  // Form Submission Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Re-check auth just in case state is stale (optional but safe)
    if (!isAuthenticated || !user || user.email !== 'adityav1304@gmail.com') {
      toast({ title: "Unauthorized", description: "Cannot submit post. Please log in again.", variant: "destructive" });
      return;
    }
    // Validation
    if (!title || !slug || !contentMd.trim() || !category) {
      toast({ title: "Missing Fields", description: "Please fill in Title, Slug, Content, and Category.", variant: "destructive" });
      return;
    }
    // Slug format validation (more robust regex)
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      toast({ title: "Invalid Slug Format", description: "Slug must contain only lowercase letters, numbers, and single hyphens. Cannot start or end with a hyphen.", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    try {
      const postData = {
        title: title.trim(), // Trim inputs
        slug: slug, // Already sanitized/validated
        content: contentMd, // Use the potentially AI-formatted Markdown
        author: user.name || 'MomCare Team', // Use logged-in user's name or fallback
        category: category,
        imageUrl: imageUrl.trim() || undefined, // Trim URL or set undefined
      };
      await createBlogPost(postData);
      toast({ title: "Blog post created", description: "Published successfully." });
      // Reset form after successful submission
      setTitle('');
      setSlug('');
      setIsSlugManuallyEdited(false);
      setContentMd('');
      setCategory('');
      setImageUrl('');
      navigate('/resources'); // Navigate after successful creation
    } catch (error: any) {
      console.error('Error creating blog post:', error);
      let description = error.message || "An unexpected error occurred.";
      // Use specific slug conflict error message if available
      if (error.message && error.message.toLowerCase().includes('slug') && error.message.toLowerCase().includes('taken')) {
        description = error.message;
      }
      toast({ title: "Failed to create blog post", description: description, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  // Loading state
  if (isAuthenticated === null) {
    return (
      <MainLayout>
        <div className="flex justify-center items-center h-screen">
          <Loader2 className="h-12 w-12 animate-spin text-momcare-primary" />
        </div>
      </MainLayout>
    );
  }

  // Unauthorized state (already handled by useEffect redirect, but good fallback)
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

  // --- Render Form ---
  // FIX 2, 3, 4, 5: Ensured the entire JSX structure is complete and correct below
  return (
    <MainLayout>
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-momcare-primary">Create Blog Post</h1>
          <p className="text-gray-600 mt-2">Share your knowledge and insights with the community.</p>
        </div>

        <Card className="border-momcare-primary/20 shadow-md">
          <form onSubmit={handleSubmit}>
            <CardHeader><CardTitle>New Blog Post Details</CardTitle></CardHeader>
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
                  pattern="^[a-z0-9]+(?:-[a-z0-9]+)*$" // HTML5 pattern validation
                  title="Use lowercase letters, numbers, and hyphens only (e.g., 'first-trimester-tips')"
                />
                <p className="text-xs text-gray-500">URL-friendly identifier. Auto-generated from title, can be edited.</p>
              </div>
              {/* Category Select */}
              <div className="space-y-2">
                <Label htmlFor="category">Category *</Label>
                <Select value={category} onValueChange={setCategory} required>
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
                />
                <p className="text-xs text-gray-500">Link to an image hosted elsewhere (e.g., Unsplash, Pexels).</p>
              </div>

              {/* --- Editor Section with AI Format Button --- */}
              <div className="space-y-2">
                <div className="flex justify-between items-center mb-1">
                  <Label htmlFor="content-editor">Content (Markdown) *</Label>
                  {/* --- AI Format Button --- */}
                  <Button
                    type="button" // Important: prevent form submission
                    variant="outline"
                    size="sm"
                    onClick={handleFormatContent}
                    disabled={isFormatting || !contentMd?.trim()}
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
                {/* The editor component */}
                <MdEditor
                  id="content-editor"
                  style={{ height: '450px', border: '1px solid hsl(var(--input))', borderRadius: 'var(--radius)' }}
                  value={contentMd}
                  // FIX 6: Wrap ReactMarkdown in a div to apply className
                  renderHTML={text => (
                    <div className="prose max-w-none p-2 dark:prose-invert"> {/* Added wrapper div */}
                      <ReactMarkdown>{text}</ReactMarkdown>
                    </div>
                  )}
                  onChange={handleEditorChange}
                  config={{
                    view: { menu: true, md: true, html: false }, // Keep HTML view off if preview is enough
                    canView: { menu: true, md: true, html: false, fullScreen: true, hideMenu: true },
                    markdownClass: 'markdown-body', // Optional class for editor's markdown view
                  }}
                />
                {/* Basic validation message */}
                {!contentMd?.trim() && <p className="text-xs text-destructive pt-1">Content is required.</p>}
              </div>
              {/* --- End Editor Section --- */}

            </CardContent>
            <CardFooter className="flex justify-between items-center pt-6 border-t">
              <Button type="button" variant="outline" onClick={() => navigate('/resources')} disabled={isLoading || isFormatting}>
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-momcare-primary hover:bg-momcare-dark min-w-[150px]"
                disabled={isLoading || isFormatting || !title || !slug || !contentMd.trim() || !category}
              >
                {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Publishing...</> : "Publish Blog Post"}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </MainLayout> // Ensure MainLayout closes correctly
  );
};

export default CreateBlogPage;
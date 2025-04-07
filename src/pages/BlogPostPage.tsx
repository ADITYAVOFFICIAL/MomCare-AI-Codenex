// src/pages/BlogPostPage.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown'; // Renders Markdown
import remarkGfm from 'remark-gfm'; // Plugin for GitHub Flavored Markdown (tables, etc.)
import rehypeHighlight from 'rehype-highlight'; // Plugin for syntax highlighting code blocks
import rehypeRaw from 'rehype-raw'; // Allows rendering raw HTML inside Markdown (Use with caution!)

// Import a highlight.js theme for syntax highlighting
// Ensure you have highlight.js installed: npm install highlight.js
// Choose a theme that fits your design (e.g., github-dark, atom-one-dark, default)
import 'highlight.js/styles/github-dark.css'; // Or your preferred theme

import { getBlogPostBySlug, deleteBlogPost, BlogPost } from '@/lib/appwrite'; // Import necessary functions and types
import MainLayout from '@/components/layout/MainLayout'; // Your main layout component
import { Button } from '@/components/ui/button'; // Your UI components
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast'; // Toast notifications
import { Loader2, ArrowLeft, User, Calendar, Tag, AlertTriangle, FileQuestion, Edit, Trash2 } from 'lucide-react'; // Icons
import { useAuthStore } from '@/store/authStore'; // Import auth store to check user role
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"; // Import AlertDialog components

// --- Helper Function ---
const formatDate = (dateInput: string | Date | undefined): string => {
  if (!dateInput) return 'Unknown date';
  try {
    const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    if (isNaN(date.getTime())) {
      return 'Invalid date';
    }
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch (error) {
    console.error("Error formatting date:", error);
    return 'Invalid date';
  }
};

// --- Constants ---
const FALLBACK_AUTHOR = 'MomCare Team';
// Ensure this matches the email used for admin checks elsewhere
const ADMIN_EMAIL = 'adityav1304@gmail.com';

// --- Component ---
const BlogPostPage: React.FC = () => {
  // Hooks
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, isAuthenticated } = useAuthStore();

  // State
  const [post, setPost] = useState<BlogPost | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Determine if the current user is an admin
  const isAdmin = isAuthenticated && user?.email === ADMIN_EMAIL;

  // --- Data Fetching ---
  const fetchPost = useCallback(async () => {
    if (!slug) {
      setError("Blog post identifier is missing.");
      setIsLoading(false);
      toast({ title: "Error", description: "Missing post identifier.", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    setError(null);
    setPost(null);
    try {
      const fetchedPost = await getBlogPostBySlug(slug);
      if (fetchedPost) {
        setPost(fetchedPost);
      } else {
        setError(`Blog post "${slug}" not found.`);
      }
    } catch (err) {
      console.error(`Error fetching blog post "${slug}":`, err);
      setError(err instanceof Error ? err.message : "Failed to load post.");
      toast({ title: "Error Loading Post", description: error || "An unknown error occurred.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [slug, toast, error]); // Added `error` to dependency array, though it might not be strictly needed if only set internally

  // Effect to fetch post data
  useEffect(() => {
    fetchPost();
  }, [fetchPost]); // fetchPost is memoized with useCallback

  // --- Delete Handler ---
  const handleDeletePost = async () => {
    if (!post?.$id || !isAdmin) {
      toast({ title: "Error", description: "Cannot delete post.", variant: "destructive" });
      return;
    }
    setIsDeleting(true);
    try {
      // Assuming no separate image bucket ID needed based on previous code
      await deleteBlogPost(post.$id /*, post.imageFileId, blogImageBucketId */);
      toast({ title: "Post Deleted", description: `"${post.title}" deleted.` });
      navigate('/resources');
    } catch (error: any) {
      console.error("Error deleting post:", error);
      toast({ title: "Deletion Failed", description: error.message || "Could not delete post.", variant: "destructive" });
      setIsDeleting(false);
    }
  };

  // --- Render Logic ---

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex justify-center items-center min-h-[calc(100vh-12rem)]">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  if (error) { // Handles both fetch errors and "Not Found" case if setError is used there
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center min-h-[calc(100vh-20rem)] text-center px-4 py-16">
          {post === null ? ( // Distinguish between general error and not found
            <FileQuestion className="h-12 w-12 text-muted-foreground mb-4" />
          ) : (
            <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
          )}
          <h2 className="text-2xl font-semibold mb-2">
            {post === null ? "Post Not Found" : "Error Loading Post"}
          </h2>
          <p className="text-muted-foreground max-w-md mb-6">{error}</p>
          <Button variant="outline" onClick={() => navigate('/resources')}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Resources
          </Button>
        </div>
      </MainLayout>
    );
  }

  if (!post) {
    // This case should ideally be covered by the error state after fetchPost sets error
    // But added as a fallback safeguard
    return (
      <MainLayout>
        <div className="text-center py-20">Post data is unavailable.</div>
      </MainLayout>
    );
  }

  // --- Success State: Render the Post ---
  return (
    <MainLayout>
      <article className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16 lg:py-20">

        {/* Top Bar: Back Navigation & Admin Controls */}
        <div className="mb-8 flex flex-wrap justify-between items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/resources')} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to All Resources
          </Button>
          {isAdmin && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => navigate(`/edit-blog/${post.slug}`)} disabled={isDeleting} aria-label={`Edit post titled ${post.title}`}>
                <Edit className="mr-1.5 h-4 w-4" /> Edit
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" disabled={isDeleting} aria-label={`Delete post titled ${post.title}`}>
                    {isDeleting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1.5 h-4 w-4" />} Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This action cannot be undone. This will permanently delete the blog post titled "<span className="font-semibold">{post.title}</span>".
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDeletePost} disabled={isDeleting} className="bg-destructive hover:bg-destructive/90">
                      {isDeleting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Deleting...</> : "Yes, delete post"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </div>

        {/* Post Header */}
        <header className="mb-10 md:mb-12 border-b pb-8">
          {post.category && (
            <Link to={`/resources?category=${encodeURIComponent(post.category)}`} className="inline-block mb-4 group" aria-label={`View posts in category ${post.category}`}>
              <Badge variant="default" className="text-sm px-3 py-1 rounded-full bg-primary/10 text-primary group-hover:bg-primary/20 transition-colors">
                <Tag className="mr-1.5 h-4 w-4" /> {post.category}
              </Badge>
            </Link>
          )}
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-foreground leading-tight tracking-tight mb-6">
            {post.title}
          </h1>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <div className="flex items-center">
              <User className="mr-1.5 h-4 w-4" />
              <span>By {post.author || FALLBACK_AUTHOR}</span>
            </div>
            <div className="flex items-center">
              <Calendar className="mr-1.5 h-4 w-4" />
              <time dateTime={post.publishedAt || post.$createdAt}>
                {formatDate(post.publishedAt || post.$createdAt)}
              </time>
            </div>
          </div>
        </header>

        {/* Optional Cover Image */}
        {post.imageUrl && (
          <figure className="my-10 md:my-12 rounded-lg overflow-hidden shadow-lg border">
            <img
              src={post.imageUrl}
              alt={`Cover image for ${post.title}`}
              className="w-full h-auto max-h-[600px] object-cover"
              width={1200} height={675} loading="lazy"
            />
          </figure>
        )}

        {/* --- Post Content Area --- */}
        <div className="max-w-3xl mx-auto">
          {/*
            Apply Tailwind Typography plugin classes here.
            - `prose`: Base class for typography styles.
            - `prose-lg`: Larger base font size and spacing. Adjust as needed (e.g., `prose`, `prose-xl`).
            - `dark:prose-invert`: Applies dark mode styles when the parent has the `dark` class.
            - `max-w-none`: Removes the default max-width constraint from prose, allowing it to fill its container.
            - Add specific overrides if needed, e.g., `prose-headings:text-your-color`, `prose-a:text-your-link-color`.
            - The `[&_p]:my-6` is an arbitrary variant to specifically target paragraphs within this div and apply margin. Adjust `my-6` as needed.
          */}
          <div className="prose prose-lg lg:prose-xl dark:prose-invert max-w-none [&_p]:my-6 prose-a:text-primary hover:prose-a:text-primary/80 prose-blockquote:border-primary">
            <ReactMarkdown
              // Plugins for enhanced Markdown features
              remarkPlugins={[remarkGfm]} // Tables, footnotes, strikethrough, task lists, etc.
              // rehypePlugins process the HTML after Markdown conversion
              rehypePlugins={[
                rehypeHighlight, // Adds syntax highlighting classes to code blocks
                rehypeRaw        // Allows rendering raw HTML embedded in Markdown (USE WITH CAUTION - potential XSS risk if content isn't trusted)
              ]}
              // You can provide custom components to override default rendering
              // components={{
              //   // Example: Render links to open in a new tab
              //   a: ({node, ...props}) => <a target="_blank" rel="noopener noreferrer" {...props} />,
              //   // Example: Add custom styling or lazy loading to images
              //   img: ({node, ...props}) => <img loading="lazy" className="rounded-md border shadow-sm" {...props} />,
              // }}
            >
              {post.content}
            </ReactMarkdown>
          </div>
        </div>
        {/* --- End Post Content Area --- */}


        {/* Optional: Tags Section */}
        {post.tags && post.tags.length > 0 && (
          <footer className="max-w-3xl mx-auto mt-12 pt-8 border-t">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
              Related Tags
            </h3>
            <div className="flex flex-wrap gap-2" aria-label="Related tags">
              {post.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="hover:bg-accent transition-colors cursor-pointer">
                  {tag}
                </Badge>
              ))}
            </div>
          </footer>
        )}

      </article>
    </MainLayout>
  );
};

export default BlogPostPage;
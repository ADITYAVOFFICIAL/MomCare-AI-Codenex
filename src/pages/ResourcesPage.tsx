// src/pages/ResourcesPage.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import MainLayout from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getBlogPosts, BlogPost } from '@/lib/appwrite'; // Import getBlogPosts and BlogPost type
import { Loader2, ChevronRight, Search, PlusCircle, Filter } from 'lucide-react';
import { Models } from 'appwrite'; // Keep Models for potential type casting if needed, though ideally getBlogPosts returns BlogPost[]
import { useAuthStore } from '@/store/authStore';
import { useToast } from '@/hooks/use-toast'; // Import useToast for error feedback

const ResourcesPage = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [featuredPost, setFeaturedPost] = useState<BlogPost | null>(null);
  const [blogPosts, setBlogPosts] = useState<BlogPost[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All'); // Default to 'All'
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { toast } = useToast(); // Initialize toast

  // Categories for filtering - ensure 'All' is first if used as default
  const categories = [
    'All',
    'Pregnancy',
    'Childbirth',
    'Postpartum',
    'Nutrition',
    'Exercise',
    'Mental Health',
    'Baby Care',
    'Parenting',
    'General Wellness',
    'Tips & Tricks',
    'Community Stories'
  ];

  // Use useCallback to memoize fetchPosts function
  const fetchPosts = useCallback(async (search = '', category = 'All') => {
    setIsLoading(true);
    console.log(`Fetching posts with search: "${search}", category: "${category}"`); // Debug log
    try {
      // Handle 'All' category selection
      const filteredCategory = category === 'All' ? '' : category;
      const postsResponse = await getBlogPosts(search, filteredCategory);

      // Assuming getBlogPosts returns BlogPost[] directly as defined in appwrite.ts
      const typedPosts: BlogPost[] = postsResponse;

      console.log(`Fetched ${typedPosts.length} posts.`); // Debug log

      if (typedPosts.length > 0) {
        // Ensure the first post has a slug before setting as featured
        if (typedPosts[0]?.slug) {
            setFeaturedPost(typedPosts[0]);
            setBlogPosts(typedPosts.slice(1));
        } else {
            // If first post has no slug, find the first one that does or handle differently
            console.warn("First fetched post is missing a slug:", typedPosts[0]);
            const firstValidFeatured = typedPosts.find(p => p.slug);
            if (firstValidFeatured) {
                setFeaturedPost(firstValidFeatured);
                setBlogPosts(typedPosts.filter(p => p.$id !== firstValidFeatured.$id));
            } else {
                // No posts with slugs found?
                setFeaturedPost(null);
                setBlogPosts(typedPosts); // Show all posts in the main list if none have slugs (unlikely)
            }
        }
      } else {
        setFeaturedPost(null);
        setBlogPosts([]);
      }
    } catch (error) {
      console.error('Error fetching blog posts:', error);
      toast({
        title: "Error Fetching Posts",
        description: "Could not load blog posts. Please try again later.",
        variant: "destructive",
      });
      setFeaturedPost(null); // Clear posts on error
      setBlogPosts([]);
    } finally {
      setIsLoading(false);
    }
  // Add dependencies for useCallback
  }, [toast]); // Include toast in dependencies if used inside

  // Initial fetch on component mount
  useEffect(() => {
    fetchPosts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchPosts]); // fetchPosts is now stable due to useCallback

  // Handler for search form submission
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchPosts(searchQuery, selectedCategory);
  };

  // Handler for category dropdown change
  const handleCategoryChange = (value: string) => {
    setSelectedCategory(value);
    fetchPosts(searchQuery, value); // Fetch posts with new category
  };

  // --- FIX: Use slug for navigation ---
  const handleViewPost = (postSlug: string | undefined) => {
    if (!postSlug) {
      console.error("Cannot navigate: Post slug is missing.");
      toast({
        title: "Navigation Error",
        description: "Could not find the identifier for this post.",
        variant: "destructive",
      });
      return;
    }
    navigate(`/blog/${postSlug}`); // Navigate using the slug
    console.log(`Navigating to post with slug: ${postSlug}`);
  };

  // Handler for navigating to the create post page
  const handleCreatePost = () => {
    navigate('/create-blog');
  };

  // Function to format date strings
  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return 'Unknown date';
    try {
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric', month: 'long', day: 'numeric'
        });
    } catch {
        return 'Invalid date'; // Handle potential invalid date strings
    }
  };

  // Helper to safely get content snippet
  const getContentSnippet = (content: string | undefined, length = 150): string => {
    if (!content) return '';
    // Basic snippet generation, remove potential HTML tags crudely for display
    const textContent = content.replace(/<[^>]*>/g, ''); // Simple tag removal
    return textContent.length > length ? `${textContent.substring(0, length)}...` : textContent;
  };


  return (
    <MainLayout>
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Page Header */}
        <div className="text-center mb-12">
          <h1 className="text-3xl md:text-4xl font-bold text-momcare-primary">Pregnancy Resources</h1>
          <p className="text-gray-600 mt-2 max-w-2xl mx-auto">
            Expert advice, tips, and guidance for every stage of your pregnancy journey.
          </p>
        </div>

        {/* Search and Filter Controls */}
        <div className="flex flex-col md:flex-row gap-4 mb-8 items-center">
          {/* Search Input */}
          <div className="flex-1 w-full md:w-auto">
            <form onSubmit={handleSearch} className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                <Input
                  type="text"
                  placeholder="Search articles by title..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 h-10" // Ensure consistent height
                />
              </div>
              <Button type="submit" className="bg-momcare-primary hover:bg-momcare-dark h-10">
                Search
              </Button>
            </form>
          </div>

          {/* Category Filter */}
          <div className="w-full md:w-auto md:min-w-[200px]">
            <Select value={selectedCategory} onValueChange={handleCategoryChange}>
              <SelectTrigger className="h-10">
                <Filter className="mr-2 h-4 w-4 text-gray-500" />
                <SelectValue placeholder="Filter by Category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map(category => (
                  <SelectItem key={category} value={category}>
                    {category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Create Post Button (Conditional) */}
          {user?.email === 'adityav1304@gmail.com' && ( // Replace with your actual admin check logic
            <Button onClick={handleCreatePost} className="w-full md:w-auto bg-momcare-accent text-white hover:bg-momcare-accent/90 h-10">
              <PlusCircle className="mr-2 h-4 w-4" />
              Create New Post
            </Button>
          )}
        </div>

        {/* Loading State */}
        {isLoading ? (
          <div className="flex justify-center items-center py-20 min-h-[300px]">
            <Loader2 className="h-12 w-12 text-momcare-primary animate-spin" />
          </div>
        ) : (
          <>
            {/* Featured Post Section */}
            {featuredPost ? (
              <div className="mb-12">
                <h2 className="text-2xl font-bold text-momcare-primary mb-4">Featured Article</h2>
                <Card className="overflow-hidden border border-momcare-primary/20 shadow-lg hover:shadow-xl transition-shadow duration-300">
                  <div className="md:flex">
                    {/* Featured Post Image */}
                    <div className="md:w-1/2 bg-momcare-light flex-shrink-0">
                      {featuredPost.imageUrl ? (
                        <img
                          src={featuredPost.imageUrl}
                          alt={featuredPost.title || 'Featured post image'}
                          className="h-64 w-full object-cover md:h-full md:max-h-[400px]" // Constrained height
                        />
                      ) : (
                        <div className="h-64 md:h-full w-full flex items-center justify-center bg-gradient-to-br from-momcare-light to-momcare-primary/10 p-10">
                          {/* Placeholder graphic or text */}
                           <svg className="w-16 h-16 text-momcare-primary/50" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                        </div>
                      )}
                    </div>
                    {/* Featured Post Content */}
                    <div className="md:w-1/2 p-6 md:p-8 flex flex-col justify-between">
                      <div>
                        <CardHeader className="px-0 pt-0 pb-3">
                          <div className="mb-2">
                            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-momcare-light text-momcare-dark tracking-wide">
                              {featuredPost.category || "General"}
                            </span>
                          </div>
                          <CardTitle className="text-2xl md:text-3xl font-bold leading-tight text-momcare-dark hover:text-momcare-primary transition-colors">
                            {/* Use handleViewPost on title click */}
                            <button onClick={() => handleViewPost(featuredPost.slug)} className="text-left hover:underline">
                                {featuredPost.title}
                            </button>
                          </CardTitle>
                          <CardDescription className="text-sm text-gray-500 pt-1">
                            By {featuredPost.author || 'MomCare Team'} • {formatDate(featuredPost.publishedAt || featuredPost.$createdAt)}
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="px-0 pb-4">
                          <p className="text-gray-700 line-clamp-4">
                            {/* Use snippet helper */}
                            {getContentSnippet(featuredPost.content, 200)}
                          </p>
                        </CardContent>
                      </div>
                      <CardFooter className="px-0 pb-0 pt-4">
                        <Button
                          // --- FIX: Use slug ---
                          onClick={() => handleViewPost(featuredPost.slug)}
                          className="bg-momcare-primary hover:bg-momcare-dark"
                        >
                          Read Full Article <ChevronRight className="ml-2 h-4 w-4" />
                        </Button>
                      </CardFooter>
                    </div>
                  </div>
                </Card>
              </div>
            ) : (
                // Only show "No featured post" if there are also no regular posts and not searching
                !featuredPost && blogPosts.length === 0 && !searchQuery && selectedCategory === 'All' && (
                    <div className="text-center py-10 text-gray-500">No featured article available yet.</div>
                )
            )}

            {/* Latest Articles / Search Results Section */}
            <h2 className="text-2xl font-bold text-momcare-primary mb-6 border-b pb-2">
              {searchQuery || selectedCategory !== 'All'
                ? 'Search Results'
                : 'Latest Articles'}
            </h2>

            {blogPosts.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {blogPosts.map((post) => (
                  <Card key={post.$id} className="border border-momcare-primary/10 hover:border-momcare-primary/30 shadow-sm hover:shadow-md transition-all duration-300 h-full flex flex-col">
                    {/* Post Image */}
                    <div className="h-48 bg-momcare-light overflow-hidden">
                      {post.imageUrl ? (
                        <img
                          src={post.imageUrl}
                          alt={post.title || 'Blog post image'}
                          className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
                        />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-momcare-light to-momcare-primary/10">
                           {/* Placeholder graphic or text */}
                           <svg className="w-12 h-12 text-momcare-primary/40" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                        </div>
                      )}
                    </div>
                    {/* Post Content */}
                    <div className="p-4 flex flex-col flex-grow">
                      <CardHeader className="px-0 pt-0 pb-2">
                        <div className="mb-2">
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-momcare-light text-momcare-dark tracking-wide">
                            {post.category || "General"}
                          </span>
                        </div>
                        <CardTitle className="text-lg font-semibold leading-snug line-clamp-2 hover:text-momcare-primary transition-colors">
                           {/* Use handleViewPost on title click */}
                           <button onClick={() => handleViewPost(post.slug)} className="text-left hover:underline">
                                {post.title}
                           </button>
                        </CardTitle>
                        <CardDescription className="text-xs text-gray-500 pt-1">
                          By {post.author || 'MomCare Team'} • {formatDate(post.publishedAt || post.$createdAt)}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="px-0 pb-3 flex-grow">
                        <p className="text-sm text-gray-600 line-clamp-3">
                          {/* Use snippet helper */}
                          {getContentSnippet(post.content)}
                        </p>
                      </CardContent>
                      <CardFooter className="px-0 pb-0 pt-3 mt-auto">
                        <Button
                          variant="outline"
                          // --- FIX: Use slug ---
                          onClick={() => handleViewPost(post.slug)}
                          className="w-full text-momcare-primary border-momcare-primary/30 hover:text-momcare-dark hover:bg-momcare-light hover:border-momcare-primary/50 text-sm"
                        >
                          Read Article
                        </Button>
                      </CardFooter>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              // No Results Message
              <div className="text-center py-16 bg-gray-50 rounded-lg border border-dashed">
                <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                </svg>
                <h3 className="mt-2 text-lg font-medium text-gray-800">No articles found</h3>
                <p className="mt-1 text-sm text-gray-500">
                  {searchQuery || selectedCategory !== 'All'
                    ? 'Try adjusting your search or filter criteria.'
                    : 'Check back soon for new content, or create the first post!'}
                </p>
                {(searchQuery || selectedCategory !== 'All') && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setSearchQuery('');
                      setSelectedCategory('All');
                      fetchPosts('', 'All'); // Fetch all posts again
                    }}
                    className="mt-4 text-momcare-primary hover:text-momcare-dark"
                  >
                    Clear Search & Filters
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </MainLayout>
  );
};

export default ResourcesPage;
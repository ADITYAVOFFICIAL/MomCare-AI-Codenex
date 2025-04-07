
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import MainLayout from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getBlogPosts } from '@/lib/appwrite';
import { Loader2, ChevronRight, Search, PlusCircle, Filter } from 'lucide-react';
import { BlogPost } from '@/types/blog';
import { Models } from 'appwrite';
import { useAuthStore } from '@/store/authStore';

const ResourcesPage = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [featuredPost, setFeaturedPost] = useState<BlogPost | null>(null);
  const [blogPosts, setBlogPosts] = useState<BlogPost[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const navigate = useNavigate();
  const { user } = useAuthStore();

  // Categories for filtering
  const categories = [
    'All',
    'Pregnancy', 
    'Childbirth', 
    'Postpartum', 
    'Nutrition', 
    'Exercise', 
    'Mental Health',
    'Baby Care',
    'Parenting'
  ];

  const fetchPosts = async (search = searchQuery, category = selectedCategory) => {
    setIsLoading(true);
    try {
      const filteredCategory = category === 'All' ? '' : category;
      const posts = await getBlogPosts(search, filteredCategory);
      
      // Convert Appwrite documents to BlogPost type
      const typedPosts = posts.map((post: Models.Document) => ({
        ...post,
        title: post.title || 'Untitled',
        content: post.content || '',
        author: post.author || 'Anonymous',
        category: post.category || 'Pregnancy',
      })) as BlogPost[];
      
      if (typedPosts.length > 0) {
        // Set the first post as featured
        setFeaturedPost(typedPosts[0]);
        // Set the rest as regular posts
        setBlogPosts(typedPosts.slice(1));
      } else {
        setFeaturedPost(null);
        setBlogPosts([]);
      }
    } catch (error) {
      console.error('Error fetching blog posts:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPosts();
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchPosts(searchQuery, selectedCategory);
  };

  const handleCategoryChange = (value: string) => {
    setSelectedCategory(value);
    fetchPosts(searchQuery, value);
  };

  const handleViewPost = (postId: string) => {
    navigate(`/blog/${postId}`);
    console.log(`Viewing post: ${postId}`);
  };

  const handleCreatePost = () => {
    navigate('/create-blog');
  };

  // Function to format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  return (
    <MainLayout>
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-momcare-primary">Pregnancy Resources</h1>
          <p className="text-gray-600 mt-2 max-w-2xl mx-auto">
            Expert advice, tips, and guidance for every stage of your pregnancy journey
          </p>
        </div>

        <div className="flex flex-col md:flex-row gap-4 mb-8">
          <div className="flex-1">
            <form onSubmit={handleSearch} className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                <Input 
                  type="text" 
                  placeholder="Search articles..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Button type="submit" className="bg-momcare-primary hover:bg-momcare-dark">
                Search
              </Button>
            </form>
          </div>
          
          <div className="w-full md:w-[180px]">
            <Select value={selectedCategory} onValueChange={handleCategoryChange}>
              <SelectTrigger>
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue placeholder="All Categories" />
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
          
          {user?.email === 'adityav1304@gmail.com' && (
            <Button onClick={handleCreatePost} className="w-full md:w-auto bg-momcare-accent text-white hover:bg-momcare-accent/90">
              <PlusCircle className="mr-2 h-4 w-4" />
              Create Post
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-10 w-10 text-momcare-primary animate-spin" />
          </div>
        ) : (
          <>
            {featuredPost && (
              <div className="mb-12">
                <Card className="overflow-hidden border-momcare-primary/20">
                  <div className="md:flex">
                    <div className="md:w-1/2 bg-momcare-light">
                      {featuredPost.imageUrl ? (
                        <img 
                          src={featuredPost.imageUrl} 
                          alt={featuredPost.title} 
                          className="h-full w-full object-cover"
                          style={{ maxHeight: '400px' }}
                        />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center bg-momcare-light p-10">
                          <p className="text-momcare-primary text-lg font-medium">MomCare AI</p>
                        </div>
                      )}
                    </div>
                    <div className="md:w-1/2 p-6 md:p-8">
                      <CardHeader className="px-0 pt-0">
                        <div className="mb-2">
                          <span className="text-xs font-medium px-2 py-1 rounded-full bg-momcare-light text-momcare-dark">
                            {featuredPost.category || "Pregnancy"}
                          </span>
                        </div>
                        <CardTitle className="text-2xl md:text-3xl">{featuredPost.title}</CardTitle>
                        <CardDescription>
                          By {featuredPost.author} • {formatDate(featuredPost.$createdAt)}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="px-0">
                        <p className="text-gray-700 line-clamp-4">
                          {featuredPost.content}
                        </p>
                      </CardContent>
                      <CardFooter className="px-0 pb-0">
                        <Button 
                          onClick={() => handleViewPost(featuredPost.$id)} 
                          className="mt-4 bg-momcare-primary hover:bg-momcare-dark"
                        >
                          Read Article <ChevronRight className="ml-2 h-4 w-4" />
                        </Button>
                      </CardFooter>
                    </div>
                  </div>
                </Card>
              </div>
            )}

            <h2 className="text-2xl font-bold text-momcare-primary mb-6">
              {searchQuery || selectedCategory !== ''
                ? 'Search Results'
                : 'Latest Articles'}
            </h2>
            
            {blogPosts.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {blogPosts.map((post) => (
                  <Card key={post.$id} className="border-momcare-primary/20 h-full flex flex-col">
                    <div className="h-48 bg-momcare-light">
                      {post.imageUrl ? (
                        <img 
                          src={post.imageUrl} 
                          alt={post.title} 
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center">
                          <p className="text-momcare-primary text-lg font-medium">MomCare AI</p>
                        </div>
                      )}
                    </div>
                    <CardHeader>
                      <div className="mb-2">
                        <span className="text-xs font-medium px-2 py-1 rounded-full bg-momcare-light text-momcare-dark">
                          {post.category || "Pregnancy"}
                        </span>
                      </div>
                      <CardTitle className="line-clamp-2">{post.title}</CardTitle>
                      <CardDescription>
                        By {post.author} • {formatDate(post.$createdAt)}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex-grow">
                      <p className="text-gray-700 line-clamp-3">
                        {post.content}
                      </p>
                    </CardContent>
                    <CardFooter>
                      <Button 
                        variant="outline" 
                        onClick={() => handleViewPost(post.$id)}
                        className="w-full text-momcare-primary border-momcare-primary/50 hover:bg-momcare-light"
                      >
                        Read Article
                      </Button>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center py-10 bg-gray-50 rounded-lg">
                <h3 className="text-xl font-medium text-gray-700 mb-2">No articles available</h3>
                <p className="text-gray-600">
                  {searchQuery || selectedCategory !== ''
                    ? 'No articles found matching your search criteria.'
                    : 'Check back soon for new content!'}
                </p>
                {(searchQuery || selectedCategory !== '') && (
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      setSearchQuery('');
                      setSelectedCategory('');
                      fetchPosts('', '');
                    }}
                    className="mt-4"
                  >
                    Clear Search
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

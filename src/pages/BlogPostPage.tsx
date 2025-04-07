import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import MainLayout from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft, Calendar, User, Tag } from 'lucide-react';
import { getBlogPost } from '@/lib/appwrite';
import { BlogPost } from '@/types/blog';

const BlogPostPage = () => {
  const { id } = useParams<{ id: string }>();
  const [post, setPost] = useState<BlogPost | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchPost = async () => {
      if (!id) return;
      
      setIsLoading(true);
      try {
        const fetchedPost = await getBlogPost(id);
        setPost(fetchedPost);
      } catch (error) {
        console.error('Error fetching blog post:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPost();
  }, [id]);

  // Format date function
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center min-h-[calc(100vh-16rem)]">
          <Loader2 className="h-8 w-8 animate-spin text-momcare-primary" />
        </div>
      </MainLayout>
    );
  }

  if (!post) {
    return (
      <MainLayout>
        <div className="max-w-4xl mx-auto px-4 py-16 text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Blog Post Not Found</h1>
          <p className="text-gray-600 mb-8">The blog post you're looking for doesn't exist or has been removed.</p>
          <Button onClick={() => navigate('/resources')} className="bg-momcare-primary hover:bg-momcare-dark">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Resources
          </Button>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <article className="max-w-4xl mx-auto px-4 py-8">
        <Button 
          variant="outline" 
          onClick={() => navigate('/resources')}
          className="mb-6"
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Resources
        </Button>

        {post.imageUrl && (
          <div className="w-full h-64 md:h-96 mb-8 rounded-lg overflow-hidden">
            <img
              src={post.imageUrl}
              alt={post.title}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        <div className="mb-6">
          <span className="inline-block px-3 py-1 rounded-full text-sm font-medium bg-momcare-light text-momcare-dark">
            {post.category}
          </span>
        </div>

        <h1 className="text-3xl md:text-4xl font-bold text-momcare-primary mb-4">{post.title}</h1>

        <div className="flex items-center text-gray-500 mb-8 space-x-6">
          <div className="flex items-center">
            <User className="mr-2 h-4 w-4" />
            <span>{post.author || 'Anonymous'}</span>
          </div>
          <div className="flex items-center">
            <Calendar className="mr-2 h-4 w-4" />
            <time dateTime={post.$createdAt}>{formatDate(post.$createdAt)}</time>
          </div>
        </div>

        <div className="prose prose-lg max-w-none">
          {/* Render content with paragraph breaks */}
          {post.content.split('\n').map((paragraph, index) => (
            paragraph ? <p key={index}>{paragraph}</p> : <br key={index} />
          ))}
        </div>
      </article>
    </MainLayout>
  );
};

export default BlogPostPage;
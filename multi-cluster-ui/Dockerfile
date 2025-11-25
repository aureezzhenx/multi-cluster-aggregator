# Gunakan nginx image resmi
FROM nginx:alpine

# Hapus default nginx content
RUN rm -rf /usr/share/nginx/html/*

# Copy web UI ke direktori nginx
COPY . /usr/share/nginx/html

# Expose port 80
EXPOSE 80

# Jalankan nginx
CMD ["nginx", "-g", "daemon off;"]

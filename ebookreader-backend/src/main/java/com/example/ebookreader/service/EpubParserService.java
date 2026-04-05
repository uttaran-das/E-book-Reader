package com.example.ebookreader.service;

import com.example.ebookreader.dto.EbookDto;
import com.example.ebookreader.entity.Book;
import com.example.ebookreader.entity.Bookmark;
import com.example.ebookreader.repository.BookRepository;
import com.example.ebookreader.repository.BookmarkRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.w3c.dom.*;
import org.xml.sax.SAXException;

import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.parsers.ParserConfigurationException;
import java.io.IOException;
import java.io.InputStream;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.util.*;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

@Service
public class EpubParserService {

    private static final Logger logger = LoggerFactory.getLogger(EpubParserService.class);

    private final BookRepository bookRepository;
    private final BookmarkRepository bookmarkRepository;
    private final Path uploadPath;

    public EpubParserService(BookRepository bookRepository, BookmarkRepository bookmarkRepository){
        this.bookRepository = bookRepository;
        this.bookmarkRepository = bookmarkRepository;
        this.uploadPath = Paths.get("library_files").toAbsolutePath().normalize();

        try{
            Files.createDirectories(this.uploadPath);
            logger.info("Library folder ready at: {}", this.uploadPath);
        } catch (IOException e) {
            throw new RuntimeException("Could not create upload directory: " + this.uploadPath, e);
        }
    }

    public EbookDto parseEpub(String bookId) {
        String filePath = getFilePathFromDb(bookId);

        EbookDto ebook = new EbookDto();

        try (ZipFile zipFile = new ZipFile(filePath)) {
            DocumentBuilder builder = DocumentBuilderFactory.newInstance().newDocumentBuilder();

            // container.xml
            ZipEntry containerEntry = zipFile.getEntry("META-INF/container.xml");
            Document containerDoc = builder.parse(zipFile.getInputStream(containerEntry));
            String opfPath = containerDoc.getElementsByTagName("rootfile").item(0).getAttributes()
                    .getNamedItem("full-path").getNodeValue();
            String basePath = "";
            if (opfPath.contains("/")) basePath = opfPath.substring(0, opfPath.lastIndexOf("/") + 1);

            // .opf
            ZipEntry opfEntry = zipFile.getEntry(opfPath);
            Document opfDoc = builder.parse(zipFile.getInputStream(opfEntry));

            // metadata
            String title = opfDoc.getElementsByTagName("dc:title").item(0).getTextContent();
            String author = opfDoc.getElementsByTagName("dc:creator").item(0).getTextContent();
            ebook.setTitle(title);
            ebook.setAuthor(author);

            // manifest
            HashMap<String, String> map = new HashMap<>();
            NodeList manifestItems = opfDoc.getElementsByTagName("item");
            for (int i = 0; i < manifestItems.getLength(); i++) {
                Element item = (Element) manifestItems.item(i);
                String href = java.net.URLDecoder.decode(item.getAttribute("href"), StandardCharsets.UTF_8);
                map.put(item.getAttribute("id"), basePath + href);
            }

            // spine
            ArrayList<String> readingOrder = new ArrayList<>();
            NodeList spineItems = opfDoc.getElementsByTagName("itemref");
            for (int i = 0; i < spineItems.getLength(); i++) {
                Element itemref = (Element) spineItems.item(i);
                readingOrder.add(map.get(itemref.getAttribute("idref")));
            }
            ebook.setSpine(readingOrder);

            // toc (.ncx)
            ArrayList<EbookDto.TocItem> tocList = new ArrayList<>();
            try {
                Node tocAttribute = opfDoc.getElementsByTagName("spine").item(0).getAttributes().
                        getNamedItem("toc");
                if (tocAttribute != null) {
                    String ncxId = tocAttribute.getNodeValue();
                    String ncxPath = map.get(ncxId);
                    if (ncxPath != null) {
                        ZipEntry ncxEntry = zipFile.getEntry(ncxPath);
                        Document ncxDoc = builder.parse(zipFile.getInputStream(ncxEntry));
                        NodeList navPoints = ncxDoc.getElementsByTagName("navPoint");

                        for (int i = 0; i < navPoints.getLength(); i++) {
                            Element navPoint = (Element) navPoints.item(i);
                            String humanReadableTitle = navPoint.getElementsByTagName("text").item(0).
                                    getTextContent();
                            String src = navPoint.getElementsByTagName("content").item(0).getAttributes().
                                    getNamedItem("src").getNodeValue();
                            src = URLDecoder.decode(src, StandardCharsets.UTF_8);
                            EbookDto.TocItem tocItem = new EbookDto.TocItem();
                            tocItem.setTitle(humanReadableTitle);
                            tocItem.setHref(basePath + src);
                            tocList.add(tocItem);
                        }
                    }
                }
            } catch (DOMException | SAXException | IOException e) {
                System.out.println("Warning: Could not parse Table of Contents (.ncx)");
                throw new RuntimeException(e);
            }
            ebook.setToc(tocList);
        } catch (IOException | ParserConfigurationException | SAXException e) {
            throw new RuntimeException(e);
        }
        return ebook;
    }

    public String getChapterContent(String bookId, String chapterPath) {
        String filePath = getFilePathFromDb(bookId);

        try (ZipFile zipFile = new ZipFile(filePath)) {
            ZipEntry entry = zipFile.getEntry(chapterPath);
            if (entry == null) return "<h1>Error: Chapter not found in EPUB</h1>";
            try (InputStream is = zipFile.getInputStream(entry)) {
                return new String(is.readAllBytes(), StandardCharsets.UTF_8);
            }
        } catch (IOException e) {
            return "<h1>Error reading chapter: " + e.getMessage() + "</h1>";
        }
    }

    public byte[] getAsset(String bookId, String assetPath) {
        String filePath = getFilePathFromDb(bookId);

        try (ZipFile zipFile = new ZipFile(filePath)) {
            ZipEntry entry = zipFile.getEntry(assetPath);
            if (entry == null) return null;
            try (InputStream is = zipFile.getInputStream(entry)) {
                return is.readAllBytes();
            }
        } catch (IOException e) {
            return null;
        }
    }

    public String uploadBook(MultipartFile file) throws Exception {
        String bookId = UUID.randomUUID().toString();
        Path destination = this.uploadPath.resolve(bookId + ".epub");
        Files.copy(file.getInputStream(), destination, StandardCopyOption.REPLACE_EXISTING);

        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try(InputStream is = Files.newInputStream(destination)){
            byte[] buffer = new byte[8192]; // 8KB: Optimal size for OS page alignment and disk I/O throughput
            int bytesRead;
            while((bytesRead=is.read(buffer))!=-1) digest.update(buffer,0,bytesRead);
        }

        String fileHash= HexFormat.of().formatHex(digest.digest());
        if(bookRepository.existsByFileHash(fileHash)) {
            Files.deleteIfExists(destination);
            logger.warn("Rejected duplicate file upload. Hash: {}", fileHash);
            throw new RuntimeException("DUPLICATE: This exact file is already in your library.");
        }

        Book book = new Book();
        book.setId(bookId);
        book.setFilePath(destination.toString());
        book.setFileHash(fileHash);

        try(ZipFile zipFile = new ZipFile(destination.toFile())){
            DocumentBuilder builder = DocumentBuilderFactory.newInstance().newDocumentBuilder();
            ZipEntry containerEntry = zipFile.getEntry("META-INF/container.xml");
            Document containerDoc = builder.parse(zipFile.getInputStream(containerEntry));
            String opfPath = containerDoc.getElementsByTagName("rootfile").item(0).getAttributes()
                    .getNamedItem("full-path").getNodeValue();
            String basePath = opfPath.contains("/")?opfPath.substring(0,opfPath.lastIndexOf("/")+1):"";
            ZipEntry opfEntry = zipFile.getEntry(opfPath);
            Document opfDoc = builder.parse(zipFile.getInputStream(opfEntry));

            // Title
            NodeList titleNodes = opfDoc.getElementsByTagName("dc:title");
            if(titleNodes.getLength()>0) book.setTitle(titleNodes.item(0).getTextContent());

            // Author
            NodeList authorNodes = opfDoc.getElementsByTagName("dc:creator");
            if(authorNodes.getLength()>0) book.setAuthor(authorNodes.item(0).getTextContent());

            // Language
            NodeList langNodes = opfDoc.getElementsByTagName("dc:language");
            if(langNodes.getLength() > 0) book.setLanguage(langNodes.item(0).getTextContent());

            // Total chapters
            NodeList spineNodes = opfDoc.getElementsByTagName("itemref");
            book.setTotalChapters(Math.max(1, spineNodes.getLength()));

            // Image
            String coverId = null;
            NodeList metaNodes = opfDoc.getElementsByTagName("meta");
            for(int i=0; i<metaNodes.getLength(); i++){
                Element meta = (Element) metaNodes.item(i);
                if("cover".equals(meta.getAttribute("name"))){
                    coverId = meta.getAttribute("content");
                    break;
                }
            }
            NodeList itemNodes = opfDoc.getElementsByTagName("item");
            for(int i = 0; i < itemNodes.getLength(); i++) {
                Element item = (Element) itemNodes.item(i);
                // Matches EPUB 2 cover ID or EPUB 3 cover-image property
                if(item.getAttribute("id").equals(coverId)
                        || "cover-image".equals(item.getAttribute("properties"))) {
                    book.setCoverPath(basePath + item.getAttribute("href"));
                    break;
                }
            }
        }

        bookRepository.save(book);
        return bookId;
    }

    private String getFilePathFromDb(String bookId) {
        return bookRepository.findById(bookId).orElseThrow(() -> new RuntimeException("Book not found in database."))
                .getFilePath();
    }

    public List<Book> getAllBooks(){
        return bookRepository.findAll();
    }

    public void updateLastReadPosition(String bookId, int chapterIndex, double progress){
        Book book = bookRepository.findById(bookId).orElse(null);
        if(book!=null){
            book.setLastReadChapterIndex(chapterIndex);
            book.setLastReadProgress(progress);
            bookRepository.save(book);
        }
    }

    public void saveBookmark(String bookId, String name, String note, int chapterIndex, String chapterTitle, double progress){
        Bookmark bookmark = new Bookmark();
        bookmark.setId(UUID.randomUUID().toString());
        bookmark.setBookId(bookId);
        bookmark.setName(name);
        bookmark.setNote(note);
        bookmark.setChapterIndex(chapterIndex);
        bookmark.setChapterTitle(chapterTitle);
        bookmark.setProgress(progress);
        bookmark.setCreatedAt(System.currentTimeMillis());

        bookmarkRepository.save(bookmark);
    }

    public List<Bookmark> getBookmarks(String bookId){
        return bookmarkRepository.findByBookIdOrderByCreatedAtDesc(bookId);
    }
}
